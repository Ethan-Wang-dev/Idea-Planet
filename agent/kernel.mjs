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

  async run(userId, taskId) {
    const task = getTask(userId, taskId);
    if (!task) throw Object.assign(new Error('Agent task not found'), { status: 404 });
    if (task.status === 'cancelled') return task;
    if (task.status !== 'queued') return task;

    setTaskStatus(userId, taskId, 'running');
    const run = createRun(userId, taskId, { provider: this.provider.name, model: this.provider.model });
    try {
      const context = await this.contextBuilder(userId, task);
      appendEvent(userId, taskId, run.id, 'context.ready', { candidateCount: context.candidates.length, ideaIds: context.candidates.map(item => item.idea.id) });
      const output = await this.provider.execute({ task, context, runId: run.id });
      if (getTask(userId, taskId)?.status === 'cancelled') {
        finishRun(userId, run.id, 'cancelled');
        appendEvent(userId, taskId, run.id, 'run.cancelled', {});
        return getTask(userId, taskId);
      }
      const saved = saveOutput(userId, { taskId, runId: run.id, type: output.type, content: output });
      appendEvent(userId, taskId, run.id, 'output.created', { outputId: saved.id, type: output.type });
      finishRun(userId, run.id, 'succeeded');
      appendEvent(userId, taskId, run.id, 'run.completed', { outputId: saved.id });
      return setTaskStatus(userId, taskId, 'succeeded');
    } catch (error) {
      const failure = { code: error.code || 'AGENT_RUN_FAILED', message: error.message };
      if (getTask(userId, taskId)?.status === 'cancelled') {
        finishRun(userId, run.id, 'cancelled', failure);
        appendEvent(userId, taskId, run.id, 'run.cancelled', failure);
        return getTask(userId, taskId);
      }
      finishRun(userId, run.id, 'failed', failure);
      appendEvent(userId, taskId, run.id, 'run.failed', failure);
      return setTaskStatus(userId, taskId, 'failed', { error: failure });
    }
  }
}

export const defaultAgentKernel = new AgentKernel();
