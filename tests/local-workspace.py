"""Local browser/disk/Recall regression. Requires Chrome and websocket-client."""
import json
import os
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path
from websocket import create_connection

ROOT = Path(__file__).resolve().parents[1]
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

with tempfile.TemporaryDirectory(prefix='idea-planet-local-test-') as directory:
    env = {**os.environ, 'PORT': '4499', 'IDEA_PLANET_HOST': '127.0.0.1',
           'IDEA_PLANET_DB': str(Path(directory) / 'planet.sqlite')}
    def start_server():
        proc = subprocess.Popen(['node', 'server.mjs'], cwd=ROOT, env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                urllib.request.urlopen('http://127.0.0.1:4499/api/v1/health').close()
                return proc
            except OSError:
                time.sleep(.05)
        proc.terminate()
        proc.wait()
        raise AssertionError('Local server did not start')

    server = start_server()
    profile = Path(directory) / 'chrome'
    chrome = subprocess.Popen([CHROME, '--headless=new', '--disable-gpu',
        '--no-first-run', '--remote-debugging-port=0',
        '--remote-allow-origins=http://localhost', '--user-data-dir=' + str(profile),
        'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws = None
    try:
        for _ in range(100):
            if (profile / 'DevToolsActivePort').exists():
                break
            time.sleep(.1)
        port = (profile / 'DevToolsActivePort').read_text().splitlines()[0]
        pages = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list'))
        ws = create_connection(next(p for p in pages if p['type'] == 'page')['webSocketDebuggerUrl'],
                               origin='http://localhost', timeout=15)
        seq = 0
        def call(method, params=None):
            global seq
            seq += 1
            ws.send(json.dumps({'id': seq, 'method': method, 'params': params or {}}))
            while True:
                result = json.loads(ws.recv())
                if result.get('id') == seq:
                    assert 'error' not in result, result
                    return result.get('result', {})
        def js(code):
            result = call('Runtime.evaluate', {'expression': code, 'returnByValue': True, 'replMode': True,
                                               'awaitPromise': True})
            assert 'exceptionDetails' not in result, result
            return result['result'].get('value')
        def until(code):
            for _ in range(100):
                if js(code):
                    return
                time.sleep(.1)
            raise AssertionError('Timed out: ' + code)
        call('Page.enable')
        call('Page.navigate', {'url': 'http://127.0.0.1:4499'})
        until("typeof apiState !== 'undefined' && apiState.ready && !apiState.booting")
        assert js("!document.querySelector('#landingRoot') && !document.querySelector('#workspaceShell').hidden")
        js("modalCapture({body:'local-regression memory'}); document.querySelector('#captureForm').requestSubmit()")
        until("Object.keys(pending).length === 0 && !apiState.syncing")
        assert js("(await apiRequest('/ideas')).ideas.some(x => x.body === 'local-regression memory')")
        js("await runAgentTask('local-regression')")
        assert js("agentState.status === 'succeeded' && agentState.output.content.citations.length > 0")
        js("await saveAgentOutput(agentState.output.id)")
        # Disk remains the source after both process restart and browser cache reset.
        server.terminate()
        server.wait(timeout=10)
        js("localStorage.clear()")
        server = start_server()
        call('Page.reload')
        until("typeof apiState !== 'undefined' && apiState.ready && !apiState.booting")
        assert js("state.ideas.some(x => x.body === 'local-regression memory')")
        assert js("state.ideas.some(x => x.author === 'Idea Planet Agent')")
        # Edits made while the local process is stopped survive and replay.
        server.terminate()
        server.wait(timeout=10)
        js("modalCapture({body:'pending-offline-idea'}); document.querySelector('#captureForm').requestSubmit()")
        until("Object.keys(pending).length > 0 && !apiState.online")
        server = start_server()
        js("await bootstrapApi()")
        until("Object.keys(pending).length === 0")
        assert js("(await apiRequest('/ideas')).ideas.some(x => x.body === 'pending-offline-idea')")
        print('PASS: no login, SQLite persistence, Recall/save, restart, offline replay')
    finally:
        if ws:
            ws.close()
        chrome.terminate()
        chrome.wait(timeout=10)
        server.terminate()
        server.wait(timeout=10)
