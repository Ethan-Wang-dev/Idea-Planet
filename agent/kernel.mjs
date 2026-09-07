import {
  appendEvent, createRun, finishRun, getTask, saveOutput, setTaskStatus
} from './repository.mjs';
import { buildContext } from './context.mjs';
import { localProvider } from './local-provider.mjs';

export class AgentKernel {
  constructor({ contextBuilder = buildContext, provider = localProvider } = {}) {
    this.contextBuilder = contextBuilder;
    this.provider = provider;
  }

  async run(workspaceId, taskId) {
    const task = getTask(workspaceId, taskId);
    if (!task) throw Object.assign(new Error('Agent task not found'), { status: 404 });
    if (task.status === 'cancelled') return task;
    if (task.status !== 'queued') return task;

    setTaskStatus(workspaceId, taskId, 'running');
    const run = createRun(workspaceId, taskId, { provider: this.provider.name, model: this.provider.model });
    try {
      const context = await this.contextBuilder(workspaceId, task);
      appendEvent(workspaceId, taskId, run.id, 'context.ready', { candidateCount: context.candidates.length, ideaIds: context.candidates.map(item => item.idea.id) });
      const output = await this.provider.execute({ task, context, runId: run.id });
      if (getTask(workspaceId, taskId)?.status === 'cancelled') {
        finishRun(workspaceId, run.id, 'cancelled');
        appendEvent(workspaceId, taskId, run.id, 'run.cancelled', {});
        return getTask(workspaceId, taskId);
      }
      const saved = saveOutput(workspaceId, { taskId, runId: run.id, type: output.type, content: output });
      appendEvent(workspaceId, taskId, run.id, 'output.created', { outputId: saved.id, type: output.type });
      finishRun(workspaceId, run.id, 'succeeded');
      appendEvent(workspaceId, taskId, run.id, 'run.completed', { outputId: saved.id });
      return setTaskStatus(workspaceId, taskId, 'succeeded');
    } catch (error) {
      const failure = { code: error.code || 'AGENT_RUN_FAILED', message: error.message };
      if (getTask(workspaceId, taskId)?.status === 'cancelled') {
        finishRun(workspaceId, run.id, 'cancelled', failure);
        appendEvent(workspaceId, taskId, run.id, 'run.cancelled', failure);
        return getTask(workspaceId, taskId);
      }
      finishRun(workspaceId, run.id, 'failed', failure);
      appendEvent(workspaceId, taskId, run.id, 'run.failed', failure);
      return setTaskStatus(workspaceId, taskId, 'failed', { error: failure });
    }
  }
}

export const defaultAgentKernel = new AgentKernel();
