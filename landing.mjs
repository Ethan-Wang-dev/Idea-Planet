const publicHome = {
  schemaVersion: '2026-09-01',
  brand: {
    name: 'Idea Planet',
    ChineseName: '想法星球',
    tagline: '让过去的想法，在今天继续为你创造。'
  },
  hero: {
    eyebrow: 'IDEA PLANET · 2026',
    title: '大胆创作',
    subtitle: '最好的学习，是把灵感留给未来的自己。',
    description: '把你在 X 上看过、写过和实践过的内容，带回一个属于你的空间。收集、回看、写下自己的判断，让每个念头都有机会变成作品。'
  },
  features: [
    { key: 'capture', title: '轻松收集', label: 'Capture', description: '看到值得留下的内容，随手带回你的星球。', accent: 'blue' },
    { key: 'reflect', title: '深度思考', label: 'Reflect', description: '在再次遇见它的时候，写下真正属于你的想法。', accent: 'gold' },
    { key: 'create', title: '持续创作', label: 'Create', description: '让零散的灵感互相连接，慢慢长成可以发布的作品。', accent: 'coral' }
  ],
  gallery: [
    { key: 'morning-notes', title: '晨间笔记', type: '图片', description: '给还没有答案的问题留一个位置。', image: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=85' },
    { key: 'field-guide', title: 'Field Notes', type: '文档', description: '从观察开始，整理一份自己的工作方法。', image: 'https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=1200&q=85' },
    { key: 'quiet-city', title: '安静的城市', type: '灵感板', description: '收集那些让你停下来多看一眼的瞬间。', image: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1200&q=85' },
    { key: 'next-steps', title: '下一步', type: '行动清单', description: '把一个想法缩小到今天就能验证的动作。', image: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=85' }
  ],
  community: {
    title: '想创作的念头，在心里转了多久？',
    description: '来自不同领域的创作者，都在 Idea Planet 开启创作。'
  },
  stats: [
    { value: '700K+', label: '创作者', description: '选择 Idea Planet 作为他们的创作工具' },
    { value: '5M+', label: '作品', description: '文档、图像、幻灯片等在这里被创作和发布' },
    { value: '70+', label: '国家和地区', description: '不同语言、文化的创作者在这里完成作品' },
    { value: '30K+', label: '技能', description: '创作者们制作并分享的可复用创作技能' }
  ],
  navigation: [
    { key: 'overview', label: '概览', target: 'hero' },
    { key: 'examples', label: '使用案例', target: 'gallery' },
    { key: 'features', label: '功能', target: 'features' },
    { key: 'prompts', label: '提示词', target: 'create' },
    { key: 'pricing', label: '定价', target: 'pricing' },
    { key: 'download', label: '下载', target: 'download' },
    { key: 'blog', label: '博客', target: 'community' },
    { key: 'updates', label: '更新', target: 'footer' }
  ]
};

export function getPublicHome() {
  return structuredClone(publicHome);
}

export function getPublicConfig() {
  return {
    service: 'idea-planet',
    schemaVersion: publicHome.schemaVersion,
    devSessionEnabled: process.env.NODE_ENV !== 'production' && process.env.IDEA_PLANET_DEV_SESSION === 'true',
    authentication: { registration: true, passwordLogin: true },
    agent: { enabled: false, status: 'designing' }
  };
}
