export const localProvider = {
  name: 'local-recall',
  model: 'deterministic-v1',
  async execute({ task, context }) {
    if (task.type !== 'recall') throw Object.assign(new Error(`No local provider for ${task.type}`), { code: 'PROVIDER_UNAVAILABLE' });
    const lines = context.candidates.length
      ? context.candidates.map(({ idea }, index) => `${index + 1}. ${idea.title || idea.body.slice(0, 120)}${idea.myThought ? `\n   我的想法：${idea.myThought}` : ''}`)
      : ['暂时没有找到与这个问题直接相关的 Idea。'];
    return {
      type: 'recall',
      text: `围绕“${context.query}”找到 ${context.candidates.length} 条相关 Idea：\n\n${lines.join('\n\n')}`,
      ideaIds: context.candidates.map(({ idea }) => idea.id),
      citations: context.citations,
      provider: 'local-recall',
      model: 'deterministic-v1'
    };
  }
};
