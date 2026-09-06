"""Browser regression checks with an isolated Chrome profile.

Run with the local server started: python3 tests/long-post.py
Requires installed Google Chrome and Python websocket-client.
"""
import json
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path
from websocket import create_connection

ROOT = Path(__file__).resolve().parents[1]
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

with tempfile.TemporaryDirectory(prefix='idea-planet-test-') as profile:
    process = subprocess.Popen([
        CHROME, '--headless=new', '--disable-gpu', '--no-first-run',
        '--remote-debugging-port=0', '--remote-allow-origins=http://localhost',
        '--user-data-dir=' + profile, 'about:blank',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        active_port = Path(profile) / 'DevToolsActivePort'
        for _ in range(100):
            if active_port.exists():
                break
            time.sleep(.1)
        port = active_port.read_text().splitlines()[0]
        pages = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list'))
        page = next(p for p in pages if p['type'] == 'page')
        ws = create_connection(page['webSocketDebuggerUrl'], origin='http://localhost', timeout=15)
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
            result = call('Runtime.evaluate', {'expression': code, 'returnByValue': True, 'awaitPromise': True})
            assert 'exceptionDetails' not in result, result
            return result['result'].get('value')

        def until(code, timeout=10):
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                if js(code):
                    return
                time.sleep(.1)
            raise AssertionError('Timed out: ' + code)

        call('Runtime.enable')
        call('Page.enable')
        js('''
          window.sent = []; window.receive = null;
          window.chrome = {runtime: {
            sendMessage: async m => {sent.push(m); return {ok:true}},
            onMessage: {addListener: f => window.receive=f}
          }};
          document.body.innerHTML = `<article>
            <a href="https://x.com/test/status/999"><time>Sep 5</time></a>
            <div data-testid="User-Name">Author</div>
            <div data-testid="tweetText">短正文</div>
            <button id="more" data-testid="tweet-text-show-more-link">Show more</button>
            <button data-testid="like">Like</button>
            <span>Show translation</span><span>125K Views</span>
          </article>`;
          window.full = '短正文\\n' + '后续内容'.repeat(6000) + '\\n42\\n@helper\\n重复\\n重复\\nEND';
          document.querySelector('#more').onclick = () => {
            document.querySelector('#more').remove();
            setTimeout(() => {
              const old = document.querySelector('article');
              const next = old.cloneNode(true);
              next.querySelector('[data-testid="tweetText"]').textContent = full;
              next.querySelector('[data-testid="tweetText"]').style.whiteSpace='pre-wrap';
              old.replaceWith(next);
            }, 1600);
          };
        ''')
        js((ROOT / 'extension/content.js').read_text())
        js("document.querySelector('[data-testid=like]').click()")
        until('sent.length === 1')
        assert js('sent[0].data.body === full'), 'Lost content or captured before asynchronous expansion'
        assert js('sent[0].data.body.length > 20000')
        print('PASS: delayed Show more, article replacement, >20k body and meaningful repeated lines')
        js("document.querySelector('[data-testid=like]').setAttribute('data-testid', 'unlike')")
        js("document.querySelector('[data-testid=tweetText]').textContent = full + '\\nSECOND END'")
        js("new Promise(resolve => receive({type:'captureCurrent'}, {}, resolve))")
        assert js("sent.length === 2 && sent[1].data.body.endsWith('SECOND END')")
        print('PASS: re-capture in the same page delivers expanded content')

        js('''
          document.body.innerHTML = `<article>
            <a href="https://x.com/i/article/777"><time>Sep 6</time></a>
            <div data-testid="User-Name">Article Author</div>
            <div data-testid="longformArticle" style="white-space:pre-wrap">Article title\nUseful paragraph\n15\n66\n239\n167K</div>
            <button data-testid="bookmark">Bookmark</button>
          </article>`;
        ''')
        until("document.querySelector('[data-testid=bookmark]').hasAttribute('data-idea-planet-observed')")
        js("document.querySelector('[data-testid=bookmark]').click()")
        until('sent.length === 3')
        assert js("sent[2].data.contentType === 'article' && sent[2].data.body === 'Article title\\nUseful paragraph'")
        print('PASS: article engagement counts removed from the saved body')

        call('Page.navigate', {'url': 'http://localhost:4317/'})
        until("location.origin === 'http://localhost:4317' && typeof render === 'function' && !!document.querySelector('.idea-card')")
        old = {'id': 'regression', 'captureId': 'same-id', 'sourceType': 'like',
               'url': 'https://twitter.com/test/status/999?s=20', 'title': '短正文',
               'body': '短正文', 'createdAt': '2026-09-05T12:00:00Z', 'status': 'kept',
               'myThought': '我的理解', 'practice': {'goal': '实际试用', 'done': False}}
        js('state.ideas = [' + json.dumps(old) + ']; saveIdeas(); render()')
        full = '短正文\n' + '\n'.join('后续段落' + str(i) for i in range(100)) + '\nEND'
        capture = {'captureId': 'same-id', 'captureKey': 'like:https://x.com/test/status/999',
                   'sourceType': 'like', 'url': 'https://x.com/test/status/999', 'title': '全文',
                   'body': full, 'contentStatus': 'expanded'}
        message = {'source': 'idea-planet-extension', 'type': 'IMPORT', 'payload': [capture]}
        js('window.postMessage(' + json.dumps(message) + ', location.origin)')
        until("state.ideas[0].body.endsWith('END')")
        assert js("state.ideas.length === 1 && state.ideas[0].myThought === '我的理解' && state.ideas[0].practice.goal === '实际试用' && state.ideas[0].status === 'kept'")
        js("state.view='library'; location.hash='library'; render()")
        assert js("!!document.querySelector('[data-action=toggleExpand]')")
        js("document.querySelector('[data-action=toggleExpand]').click()")
        assert js("!document.querySelector('.idea-body').classList.contains('clamp') && document.querySelector('.idea-body').textContent.endsWith('END')")
        call('Page.reload')
        until("typeof render === 'function' && !!document.querySelector('.idea-card')")
        assert js("state.ideas.length === 1 && state.ideas[0].body.endsWith('END') && state.ideas[0].myThought === '我的理解'")
        print('PASS: legacy/same-ID record upgraded, thoughts/practice preserved, full text visible and persisted')
        ws.close()
    finally:
        process.terminate()
        process.wait(timeout=15)
