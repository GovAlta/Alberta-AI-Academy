<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useContentStore } from '@/stores/content.js'
import { useAiStore } from '@/stores/ai.js'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'
import DiagramFlow from '@/components/diagrams/DiagramFlow.vue'
import { useI18n } from 'vue-i18n'
import { useContentLocale } from '@/composables/useContentLocale.js'

const { t } = useI18n()
const { tc } = useContentLocale()

const contentStore = useContentStore()
const aiStore = useAiStore()
const levels = computed(() => contentStore.levels)

// ── Level 1: Prompting ──────────────────────────────────────────────────────
const nodeStyle = (bg, border, color) => ({
  background: bg, border: `2px solid ${border}`, borderRadius: '8px',
  padding: '10px 16px', fontSize: '13px', fontWeight: '600',
  color, minWidth: '90px', textAlign: 'center', lineHeight: '1.4'
})

const l1Nodes = [
  { id: 'you',      label: 'You\nwrite prompt', position: { x: 0,   y: 70 }, style: nodeStyle('#e0e7ff', '#6366f1', '#3730a3') },
  { id: 'prompt',   label: 'Prompt',            position: { x: 170, y: 70 }, style: nodeStyle('#c7d2fe', '#6366f1', '#3730a3') },
  { id: 'ai',       label: 'AI Model',          position: { x: 340, y: 50 }, style: { ...nodeStyle('#312e81', '#6366f1', '#e0e7ff'), padding: '16px 20px', fontSize: '14px' } },
  { id: 'response', label: 'Response\nreview & use', position: { x: 510, y: 70 }, style: nodeStyle('#e0e7ff', '#6366f1', '#3730a3') },
]
const edgeStyle = (color) => ({ style: { stroke: color, strokeWidth: 2 }, animated: true })
const l1Edges = [
  { id: 'e1', source: 'you',    target: 'prompt',   ...edgeStyle('#6366f1') },
  { id: 'e2', source: 'prompt', target: 'ai',       ...edgeStyle('#6366f1') },
  { id: 'e3', source: 'ai',     target: 'response', ...edgeStyle('#6366f1') },
]

// ── Level 2: Agentic Workflow ───────────────────────────────────────────────
const l2Nodes = [
  { id: 'goal',    label: 'Your Goal',   position: { x: 170, y: 0   }, style: nodeStyle('#d1fae5', '#059669', '#065f46') },
  { id: 'agent',   label: 'AI Agent\nplans & calls tools', position: { x: 155, y: 110 }, style: { ...nodeStyle('#064e3b', '#10b981', '#d1fae5'), padding: '14px 20px', minWidth: '130px' } },
  { id: 'search',  label: '🔍 Search',  position: { x: 0,   y: 230 }, style: nodeStyle('#d1fae5', '#059669', '#065f46') },
  { id: 'write',   label: '✍️ Write',   position: { x: 170, y: 230 }, style: nodeStyle('#d1fae5', '#059669', '#065f46') },
  { id: 'analyse', label: '📊 Analyse', position: { x: 340, y: 230 }, style: nodeStyle('#d1fae5', '#059669', '#065f46') },
]
const l2Edges = [
  { id: 'e1', source: 'goal',  target: 'agent',   type: 'smoothstep', ...edgeStyle('#059669') },
  { id: 'e2', source: 'agent', target: 'search',  type: 'smoothstep', ...edgeStyle('#10b981') },
  { id: 'e3', source: 'agent', target: 'write',   type: 'smoothstep', ...edgeStyle('#10b981') },
  { id: 'e4', source: 'agent', target: 'analyse', type: 'smoothstep', ...edgeStyle('#10b981') },
]

// ── Level 3: AI Factory ─────────────────────────────────────────────────────
const l3Nodes = [
  { id: 'orch',     label: 'Orchestrator\nroutes & coordinates', position: { x: 150, y: 0   }, style: { ...nodeStyle('#7c3aed', '#a78bfa', '#ede9fe'), padding: '14px 24px', minWidth: '160px' } },
  { id: 'research', label: 'Research\nAgent',  position: { x: 0,   y: 140 }, style: nodeStyle('#4c1d95', '#8b5cf6', '#ede9fe') },
  { id: 'draft',    label: 'Draft\nAgent',     position: { x: 175, y: 140 }, style: nodeStyle('#4c1d95', '#8b5cf6', '#ede9fe') },
  { id: 'review',   label: 'Review\nAgent',    position: { x: 350, y: 140 }, style: nodeStyle('#4c1d95', '#8b5cf6', '#ede9fe') },
  { id: 'pipeline', label: '⚡ Output Pipeline', position: { x: 100, y: 270 }, style: { ...nodeStyle('#ede9fe', '#7c3aed', '#4c1d95'), minWidth: '240px', textAlign: 'center' } },
]
const l3Edges = [
  { id: 'e1', source: 'orch',     target: 'research', type: 'smoothstep', ...edgeStyle('#a78bfa') },
  { id: 'e2', source: 'orch',     target: 'draft',    ...edgeStyle('#a78bfa') },
  { id: 'e3', source: 'orch',     target: 'review',   type: 'smoothstep', ...edgeStyle('#a78bfa') },
  { id: 'e4', source: 'research', target: 'pipeline', type: 'smoothstep', ...edgeStyle('#8b5cf6') },
  { id: 'e5', source: 'draft',    target: 'pipeline', ...edgeStyle('#8b5cf6') },
  { id: 'e6', source: 'review',   target: 'pipeline', type: 'smoothstep', ...edgeStyle('#8b5cf6') },
]

const TYPE_ICONS = {
  video: '▶',
  article: '📄',
  tool: '🔧',
  download: '⬇',
  social: '🔗',
  link: '↗',
  module: '📋'
}

const totalResources = computed(() =>
  contentStore.levels.reduce((sum, l) => sum + l.items.length, 0)
)

function getFeaturedItems(level) {
  return level.items.filter((item) => item.featured).slice(0, 3)
}

const LEVEL_DISPLAY_NAMES = {
  masterclass: 'Masterclass',
  level1: 'Foundations',
  level2: 'Applied Intelligence',
  level3: 'Agentic Mastery',
}
</script>

<template>
  <div class="page-layout">
    <AppHeader />

    <main id="main-content" class="page-main">
      <!-- Hero -->
      <section class="hero" aria-labelledby="hero-heading">
        <div class="goa-container hero__inner">
          <div class="hero__content">
            <p class="hero__eyebrow">{{ t('home.eyebrow') }}</p>
            <h1 id="hero-heading" class="hero__title">{{ t('home.title') }}</h1>
            <p class="hero__tagline">{{ t('home.tagline') }}</p>
            <p class="hero__subtitle">
              {{ t('home.subtitle') }}
            </p>
            <div class="hero__actions">
              <RouterLink to="/level/masterclass" class="btn btn--primary hero__cta">
                {{ t('home.startMasterclass') }}
              </RouterLink>
              <RouterLink to="/level/level1" class="btn btn--secondary hero__cta">
                {{ t('home.jumpToLevel1') }}
              </RouterLink>
            </div>
          </div>
          <div class="hero__stats" aria-label="Site statistics">
            <div class="hero__stat">
              <span class="hero__stat-number">{{ totalResources }}</span>
              <span class="hero__stat-label">{{ t('home.resources') }}</span>
            </div>
            <div class="hero__stat">
              <span class="hero__stat-number">{{ contentStore.levels.length }}</span>
              <span class="hero__stat-label">{{ t('home.levels') }}</span>
            </div>
            <div class="hero__stat">
              <span class="hero__stat-number">{{ t('home.free') }}</span>
              <span class="hero__stat-label">{{ t('home.always') }}</span>
            </div>
          </div>
          <div class="hero__banner">
            <span class="hero__banner-label">NEW RESOURCE</span>
            <p class="hero__banner-headline">Alberta sets North American standard for AI</p>
            <p class="hero__banner-body">Alberta has accelerated the rebuilding of the decades-old technology behind its public services in a fraction of the usual time and cost. Using AI tools from Anthropic and Google, Alberta can now do in hours what once took years.</p>
            <p class="hero__banner-body">Alberta is sharing everything it has learned with the publication of 21 technical papers, the Velocity White Papers, released as free and open-source resources so other governments can follow the same path.</p>
            <a href="https://www.alberta.ca/release.cfm?xID=96456379DDC57-9F6B-FE7E-69C325AD64A91DCD" target="_blank" rel="noopener" class="hero__banner-link">Read the press release →</a>
          </div>
        </div>
      </section>

      <!-- About -->
      <section class="about-section">
        <div class="goa-container">
          <div class="about__intro">
            <div class="about__intro-text">
              <h2 class="about__title">{{ t('home.aboutTitle') }}</h2>
              <p>{{ t('home.aboutP1') }}</p>
              <h3 class="about__why-heading">{{ t('home.whyBuiltTitle') }}</h3>
              <p>{{ t('home.aboutP2') }}</p>
              <p>{{ t('home.aboutP3') }}</p>
              <p class="about__mandate" v-html="t('home.aboutMandate')"></p>
            </div>
            <div class="about__cta-card">
              <div class="about__cta-icon" aria-hidden="true">🎓</div>
              <h3 class="about__cta-title">{{ t('home.startMasterclassCard') }}</h3>
              <p class="about__cta-desc">
                {{ t('home.masterclassCardDesc') }}
              </p>
              <RouterLink to="/level/masterclass" class="btn btn--primary">
                {{ t('home.openMasterclass') }}
              </RouterLink>
              <div class="about__path-list">
                <p class="about__path-label">{{ t('home.choosePathLabel') }}</p>
                <ul>
                  <li><strong>{{ t('home.pathLevel1') }}</strong></li>
                  <li><strong>{{ t('home.pathLevel2') }}</strong></li>
                  <li><strong>{{ t('home.pathLevel3') }}</strong></li>
                </ul>
              </div>
              <div class="about__videos">
                <p class="about__path-label">{{ t('home.watchFirstLabel') }}</p>
                <div class="about__video-list">
                  <a href="https://youtu.be/UEI-e0fyHSU" target="_blank" rel="noopener" class="about__video-card">
                    <div class="about__video-thumb">
                      <img src="https://img.youtube.com/vi/UEI-e0fyHSU/mqdefault.jpg" alt="Alberta AI Academy - Keynote" />
                      <span class="about__video-play">▶</span>
                    </div>
                    <span class="about__video-title">{{ t('home.videoKeynote') }}</span>
                  </a>
                  <a href="https://youtu.be/x86j_FAC6sQ" target="_blank" rel="noopener" class="about__video-card">
                    <div class="about__video-thumb">
                      <img src="https://img.youtube.com/vi/x86j_FAC6sQ/mqdefault.jpg" alt="The Government of Alberta's AI Playbook" />
                      <span class="about__video-play">▶</span>
                    </div>
                    <span class="about__video-title">{{ t('home.videoPlaybook') }}</span>
                  </a>
                  <a href="https://youtu.be/bm4ZmSkxRpk" target="_blank" rel="noopener" class="about__video-card">
                    <div class="about__video-thumb">
                      <img src="https://img.youtube.com/vi/bm4ZmSkxRpk/mqdefault.jpg" alt="The Case for Change" />
                      <span class="about__video-play">▶</span>
                    </div>
                    <span class="about__video-title">{{ t('home.videoCaseForChange') }}</span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div class="about__skills">
            <h3 class="about__skills-title">{{ t('home.skillsTitle') }}</h3>
            <p class="about__skills-subtitle">{{ t('home.skillsSubtitle') }}</p>
            <div class="about__skills-grid">
              <div class="skill-card">
                <div class="skill-card__icon">🗣️</div>
                <h4 class="skill-card__title">{{ t('home.skillCommunicationTitle') }}</h4>
                <p class="skill-card__body">{{ t('home.skillCommunicationBody') }}</p>
              </div>
              <div class="skill-card">
                <div class="skill-card__icon">🧠</div>
                <h4 class="skill-card__title">{{ t('home.skillCriticalTitle') }}</h4>
                <p class="skill-card__body">{{ t('home.skillCriticalBody') }}</p>
              </div>
              <div class="skill-card">
                <div class="skill-card__icon">🔍</div>
                <h4 class="skill-card__title">{{ t('home.skillCuriosityTitle') }}</h4>
                <p class="skill-card__body">{{ t('home.skillCuriosityBody') }}</p>
              </div>
            </div>
            <p class="about__skills-footer" v-html="t('home.skillsFooter')"></p>
          </div>
        </div>
      </section>

      <!-- Level Diagrams -->
      <section class="diagrams-section" aria-labelledby="diagrams-heading">
        <div class="goa-container">
          <h2 id="diagrams-heading" class="section-title">{{ t('home.diagramsTitle') }}</h2>
          <p class="section-subtitle">{{ t('home.diagramsSubtitle') }}</p>

          <div class="diagrams-grid">

            <!-- Level 1: Prompting -->
            <div class="diagram-card diagram-card--l1">
              <div class="diagram-card__header">
                <span class="diagram-card__badge">{{ t('home.level1Badge') }}</span>
                <h3 class="diagram-card__title">{{ t('home.level1Title') }}</h3>
                <p class="diagram-card__subtitle">{{ t('home.level1Subtitle') }}</p>
              </div>
              <DiagramFlow
                :nodes="l1Nodes"
                :edges="l1Edges"
                title="Level 1 — Foundations"
              />
              <div class="diagram-card__desc" v-html="t('home.level1Desc')"></div>
              <RouterLink to="/level/level1" class="btn btn--outline diagram-card__link">{{ t('home.exploreLevel1') }}</RouterLink>
            </div>

            <!-- Level 2: Agentic Workflows -->
            <div class="diagram-card diagram-card--l2">
              <div class="diagram-card__header">
                <span class="diagram-card__badge diagram-card__badge--l2">{{ t('home.level2Badge') }}</span>
                <h3 class="diagram-card__title">{{ t('home.level2Title') }}</h3>
                <p class="diagram-card__subtitle">{{ t('home.level2Subtitle') }}</p>
              </div>
              <DiagramFlow
                :nodes="l3Nodes"
                :edges="l3Edges"
                title="Level 2 — Applied Intelligence"
              />
              <div class="diagram-card__desc" v-html="t('home.level2Desc')"></div>
              <RouterLink to="/level/level2" class="btn btn--outline diagram-card__link diagram-card__link--l2">{{ t('home.exploreLevel2') }}</RouterLink>
            </div>

            <!-- Level 3: AI Factory -->
            <div class="diagram-card diagram-card--l3">
              <div class="diagram-card__header">
                <span class="diagram-card__badge diagram-card__badge--l3">{{ t('home.level3Badge') }}</span>
                <h3 class="diagram-card__title">{{ t('home.level3Title') }}</h3>
                <p class="diagram-card__subtitle">{{ t('home.level3Subtitle') }}</p>
              </div>
              <DiagramFlow
                :nodes="l2Nodes"
                :edges="l2Edges"
                title="Level 3 — Agentic Mastery"
              />
              <div class="diagram-card__desc" v-html="t('home.level3Desc')"></div>
              <RouterLink to="/level/level3" class="btn btn--outline diagram-card__link diagram-card__link--l3">{{ t('home.exploreLevel3') }}</RouterLink>
            </div>

          </div>
        </div>
      </section>

      <!-- Closing -->
      <section class="closing-section">
        <div class="goa-container closing__inner">
          <div class="closing__block">
            <h3 class="closing__title">{{ t('home.closingDemandTitle') }}</h3>
            <div v-html="t('home.closingDemandBody')"></div>
          </div>
          <div class="closing__block closing__block--highlight">
            <h3 class="closing__title">{{ t('home.closingBuiltTitle') }}</h3>
            <div v-html="t('home.closingBuiltBody')"></div>
          </div>
        </div>
      </section>

      <!-- Levels -->
      <section class="levels-section" aria-labelledby="levels-heading">
        <div class="goa-container">
          <h2 id="levels-heading" class="section-title">{{ t('home.chooseLevel') }}</h2>
          <p class="section-subtitle">{{ t('home.chooseLevelSub') }}</p>
          <div class="levels-grid">
            <div
              v-for="level in levels"
              :key="level.id"
              class="level-card"
              :style="{ '--level-colour': level.colour }"
            >
              <div class="level-card__header">
                <h3 class="level-card__title">{{ LEVEL_DISPLAY_NAMES[level.id] || tc(level.title) }}</h3>
                <span class="level-card__icon" aria-hidden="true">{{ level.icon }}</span>
              </div>
              <p class="level-card__json-title">{{ tc(level.title) }}</p>
              <p class="level-card__subtitle">{{ tc(level.subtitle) }}</p>
              <p class="level-card__description">{{ tc(level.description) }}</p>
              <p class="level-card__meta">
                <span class="level-card__count">{{ level.items.length }} {{ t('home.resources').toLowerCase() }}</span>
                · <span class="badge" :class="`badge--${level.difficulty}`">{{ level.difficulty }}</span>
              </p>
              <div class="level-card__featured" aria-label="Featured resources">
                <p class="level-card__featured-label">{{ t('home.highlights') }}</p>
                <ul class="level-card__featured-list">
                  <li
                    v-for="item in getFeaturedItems(level)"
                    :key="item.id"
                    class="level-card__featured-item"
                  >
                    <span class="level-card__featured-icon" aria-hidden="true">{{ TYPE_ICONS[item.type] }}</span>
                    <span>{{ tc(item.title) }}</span>
                  </li>
                </ul>
              </div>
              <RouterLink
                :to="`/level/${level.id}`"
                class="btn btn--primary level-card__cta"
                :aria-label="`${t('home.explore')} ${tc(level.title)}`"
              >
                {{ t('home.explore') }} {{ tc(level.title).split(':')[0] }} →
              </RouterLink>
            </div>
          </div>
        </div>
      </section>

      <!-- AI Assistant CTA -->
      <section class="ai-cta-section" aria-labelledby="ai-cta-heading">
        <div class="goa-container ai-cta-section__inner">
          <div class="ai-cta-section__content">
            <h2 id="ai-cta-heading" class="ai-cta-section__title">
              {{ t('home.personalPlan') }}
            </h2>
            <p class="ai-cta-section__description">
              {{ t('home.personalPlanDesc') }}
            </p>
            <button class="btn btn--primary ai-cta-section__btn" @click="aiStore.openPanel()" aria-label="Open AI assistant">
              {{ t('home.chatWithAI') }}
            </button>
          </div>
          <div class="ai-cta-section__visual" aria-hidden="true">
            <div class="ai-cta-section__bubble">
              <p>{{ t('home.bubble1') }}</p>
            </div>
            <div class="ai-cta-section__bubble ai-cta-section__bubble--user">
              <p>{{ t('home.bubble2') }}</p>
            </div>
            <div class="ai-cta-section__bubble">
              <p>{{ t('home.bubble3') }}</p>
            </div>
          </div>
        </div>
      </section>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
/* Hero */
.hero {
  background: linear-gradient(135deg, var(--goa-color-brand-dark) 0%, var(--goa-color-brand-default) 100%);
  color: var(--goa-color-text-light);
  padding: var(--goa-space-3xl) 0;
}

.hero__inner {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: var(--goa-space-2xl);
  align-items: center;
}

.hero__eyebrow {
  margin: 0 0 var(--goa-space-xs) 0;
  font-size: var(--goa-font-size-2);
  font-weight: var(--goa-font-weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.8;
}

.hero__title {
  color: var(--goa-color-text-light);
  font-size: clamp(2rem, 5vw, 3rem);
  margin: 0 0 var(--goa-space-m) 0;
}

.hero__subtitle {
  font-size: var(--goa-font-size-5);
  line-height: var(--goa-line-height-4);
  opacity: 0.9;
  max-width: 52ch;
  margin: 0 0 var(--goa-space-xl) 0;
}

.hero__actions {
  display: flex;
  gap: var(--goa-space-m);
  flex-wrap: wrap;
}

.hero__cta {
  min-width: 160px;
}

.hero .btn--primary {
  background-color: #fff;
  border-color: #fff;
  color: var(--goa-color-brand-default);
}

.hero .btn--primary:visited,
.hero .btn--primary:active {
  color: var(--goa-color-brand-default);
}

.hero .btn--primary:hover {
  background-color: rgba(255, 255, 255, 0.9);
  border-color: rgba(255, 255, 255, 0.9);
  color: var(--goa-color-brand-default);
}

.hero .btn--secondary {
  background-color: transparent;
  border-color: rgba(255, 255, 255, 0.7);
  color: #fff;
}

.hero .btn--secondary:visited,
.hero .btn--secondary:active {
  color: #fff;
}

.hero .btn--secondary:hover {
  background-color: rgba(255, 255, 255, 0.15);
  border-color: #fff;
  color: #fff;
}

.hero__stats {
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-l);
  background: rgba(255, 255, 255, 0.1);
  border-radius: var(--goa-border-radius-xl);
  padding: var(--goa-space-xl);
  min-width: 180px;
}

.hero__stat {
  text-align: center;
}

.hero__stat-number {
  display: block;
  font-size: var(--goa-font-size-8);
  font-weight: var(--goa-font-weight-bold);
  line-height: 1;
  margin-bottom: var(--goa-space-2xs);
}

.hero__stat-label {
  display: block;
  font-size: var(--goa-font-size-2);
  opacity: 0.8;
}

@media screen and (max-width: 768px) {
  .hero__inner {
    grid-template-columns: 1fr;
  }

  .hero__stats {
    flex-direction: row;
    min-width: unset;
    justify-content: space-around;
  }
}

/* Hero tagline */
.hero__tagline {
  font-size: var(--goa-font-size-3);
  font-weight: var(--goa-font-weight-bold);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  opacity: 0.7;
  margin: 0 0 var(--goa-space-s) 0;
}

/* Hero Banner Card */
.hero__banner {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: var(--goa-border-radius-xl);
  border-left: 3px solid #f5a623;
  padding: var(--goa-space-xl);
  max-width: 280px;
  align-self: stretch;
}
.hero__banner-label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #f5a623;
  border: 1px solid #f5a623;
  border-radius: 3px;
  padding: 3px 8px;
  align-self: flex-start;
}
.hero__banner-headline {
  color: #ffffff;
  font-weight: 700;
  font-size: 0.95rem;
  margin: 4px 0 0;
  line-height: 1.3;
}
.hero__banner-body {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.78rem;
  margin: 0;
  line-height: 1.5;
}
.hero__banner-link {
  color: #f5a623;
  font-weight: 600;
  font-size: 0.82rem;
  text-decoration: none;
  margin-top: 6px;
}
.hero__banner-link:hover {
  text-decoration: underline;
}

/* About Section */
.about-section {
  padding: var(--goa-space-3xl) 0;
  background: var(--goa-color-greyscale-white);
}

.about__title {
  font-size: clamp(1.5rem, 3vw, 2rem);
  color: var(--goa-color-text-default);
  margin: 0 0 var(--goa-space-l) 0;
}

.about__intro {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: var(--goa-space-3xl);
  align-items: start;
}

@media screen and (max-width: 900px) {
  .about__intro {
    grid-template-columns: 1fr;
  }
}

.about__intro-text p {
  font-size: var(--goa-font-size-4);
  line-height: var(--goa-line-height-5);
  color: var(--goa-color-text-secondary);
  margin: 0 0 var(--goa-space-l) 0;
  max-width: 72ch;
}

.about__why-heading {
  font-size: var(--goa-font-size-5);
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-text-default);
  margin: var(--goa-space-l) 0 var(--goa-space-s) 0;
}

.about__mandate {
  border-left: 4px solid var(--goa-color-brand-default);
  padding-left: var(--goa-space-l);
  font-size: var(--goa-font-size-4) !important;
  color: var(--goa-color-text-default) !important;
}

.about__mandate strong {
  color: var(--goa-color-brand-default);
}

.about__cta-card {
  background: linear-gradient(160deg, #f5f3ff 0%, #ede9fe 100%);
  border: 1px solid #c4b5fd;
  border-radius: var(--goa-border-radius-xl);
  padding: var(--goa-space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-m);
  position: sticky;
  top: var(--goa-space-xl);
}

.about__cta-icon { font-size: 2rem; }

.about__cta-title {
  font-size: var(--goa-font-size-5);
  font-weight: var(--goa-font-weight-bold);
  color: #3730a3;
  margin: 0;
}

.about__cta-desc {
  font-size: var(--goa-font-size-3);
  color: #4c1d95;
  line-height: var(--goa-line-height-4);
  margin: 0;
}

.about__path-list {
  margin-top: var(--goa-space-s);
  padding-top: var(--goa-space-m);
  border-top: 1px solid #c4b5fd;
}

.about__path-label {
  font-size: var(--goa-font-size-2);
  font-weight: var(--goa-font-weight-bold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #5b21b6;
  margin: 0 0 var(--goa-space-s) 0;
}

.about__path-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-s);
}

.about__path-list li {
  font-size: var(--goa-font-size-2);
  color: #4c1d95;
  line-height: 1.5;
  padding-left: var(--goa-space-m);
  position: relative;
}

.about__path-list li::before {
  content: '→';
  position: absolute;
  left: 0;
  color: #7c3aed;
  font-weight: bold;
}

.about__videos {
  margin-top: var(--goa-space-m);
  padding-top: var(--goa-space-m);
  border-top: 1px solid #c4b5fd;
}

.about__video-list {
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-s);
  margin-top: var(--goa-space-s);
}

.about__video-card {
  display: flex;
  align-items: center;
  gap: var(--goa-space-m);
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid #c4b5fd;
  border-radius: var(--goa-border-radius-l);
  overflow: hidden;
  text-decoration: none;
  transition: background var(--goa-transition-base), border-color var(--goa-transition-base);
}

.about__video-card:hover {
  background: rgba(255, 255, 255, 0.9);
  border-color: #7c3aed;
}

.about__video-thumb {
  position: relative;
  flex-shrink: 0;
  width: 96px;
  height: 54px;
}

.about__video-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.about__video-play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 0.9rem;
  transition: background var(--goa-transition-base);
}

.about__video-card:hover .about__video-play {
  background: rgba(124, 58, 237, 0.7);
}

.about__video-title {
  font-size: var(--goa-font-size-2);
  font-weight: var(--goa-font-weight-medium);
  color: #3730a3;
  line-height: 1.4;
  padding-right: var(--goa-space-m);
}

.about__skills {
  margin-top: var(--goa-space-3xl);
  padding-top: var(--goa-space-2xl);
  border-top: 1px solid var(--goa-color-greyscale-200);
}

.about__skills-title {
  font-size: var(--goa-font-size-6);
  color: var(--goa-color-text-default);
  margin: 0 0 var(--goa-space-xs) 0;
}

.about__skills-subtitle {
  color: var(--goa-color-text-secondary);
  font-size: var(--goa-font-size-3);
  margin: 0 0 var(--goa-space-xl) 0;
}

.about__skills-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--goa-space-xl);
}

@media screen and (max-width: 768px) {
  .about__skills-grid {
    grid-template-columns: 1fr;
  }
}

.skill-card {
  background: var(--goa-color-greyscale-50);
  border-radius: var(--goa-border-radius-xl);
  padding: var(--goa-space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-s);
}

.skill-card__icon {
  font-size: 1.8rem;
}

.skill-card__title {
  font-size: var(--goa-font-size-4);
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-text-default);
  margin: 0;
}

.skill-card__body {
  font-size: var(--goa-font-size-3);
  color: var(--goa-color-text-secondary);
  line-height: var(--goa-line-height-4);
  margin: 0;
}

.about__skills-footer {
  margin-top: var(--goa-space-xl);
  font-size: var(--goa-font-size-3);
  color: var(--goa-color-text-secondary);
  font-style: italic;
  text-align: center;
  text-wrap: balance;
}

/* Closing Section */
.closing-section {
  padding: var(--goa-space-3xl) 0;
  background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
}

.closing__inner {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--goa-space-3xl);
}

@media screen and (max-width: 768px) {
  .closing__inner {
    grid-template-columns: 1fr;
  }
}

.closing__block {
  color: #e2e8f0;
}

.closing__block--highlight {
  border-left: 3px solid #6366f1;
  padding-left: var(--goa-space-xl);
}

.closing__title {
  font-size: var(--goa-font-size-5);
  font-weight: var(--goa-font-weight-bold);
  color: #fff;
  margin: 0 0 var(--goa-space-m) 0;
}

.closing__block p {
  font-size: var(--goa-font-size-3);
  line-height: var(--goa-line-height-4);
  color: #cbd5e1;
  margin: 0 0 var(--goa-space-m) 0;
}

.closing__sign-off {
  color: #e2e8f0 !important;
}

.closing__sign-off strong {
  color: #fff;
}

/* Diagrams Section */
.diagrams-section {
  padding: var(--goa-space-3xl) 0;
  background: var(--goa-color-greyscale-50);
}

.diagrams-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--goa-space-xl);
  margin-top: var(--goa-space-2xl);
}

@media screen and (max-width: 1024px) {
  .diagrams-grid {
    grid-template-columns: 1fr;
    max-width: 560px;
    margin-left: auto;
    margin-right: auto;
  }
}

.diagram-card {
  background: var(--goa-color-greyscale-white);
  border-radius: var(--goa-border-radius-xl);
  padding: var(--goa-space-xl);
  box-shadow: var(--goa-shadow-200);
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-m);
  border-top: 4px solid #6366f1;
  transition: box-shadow var(--goa-transition-base), transform var(--goa-transition-base);
}

.diagram-card--l2 { border-top-color: #059669; }
.diagram-card--l3 { border-top-color: #7c3aed; }

.diagram-card:hover {
  box-shadow: var(--goa-shadow-400);
  transform: translateY(-3px);
}

.diagram-card__header {
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-xs);
}

.diagram-card__badge {
  display: inline-block;
  font-size: var(--goa-font-size-1);
  font-weight: var(--goa-font-weight-bold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: #e0e7ff;
  color: #3730a3;
  padding: 2px 10px;
  border-radius: 20px;
  width: fit-content;
}

.diagram-card__badge--l2 {
  background: #d1fae5;
  color: #065f46;
}

.diagram-card__badge--l3 {
  background: #ede9fe;
  color: #4c1d95;
}

.diagram-card__title {
  font-size: var(--goa-font-size-5);
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-text-default);
  margin: 0;
  line-height: 1.3;
}

.diagram-card__subtitle {
  font-size: var(--goa-font-size-2);
  color: var(--goa-color-text-secondary);
  margin: 0;
}


.diagram-card__desc {
  flex: 1;
}

.diagram-card__desc p {
  font-size: var(--goa-font-size-3);
  color: var(--goa-color-text-secondary);
  line-height: var(--goa-line-height-4);
  margin: 0 0 var(--goa-space-s) 0;
}

.diagram-card__desc p:last-child {
  margin-bottom: 0;
}

.diagram-card__link {
  align-self: flex-start;
  border-color: #6366f1;
  color: #4338ca;
}

.diagram-card__link:hover {
  background: #6366f1;
  color: #fff;
}

.diagram-card__link--l2 {
  border-color: #059669;
  color: #065f46;
}

.diagram-card__link--l2:hover {
  background: #059669;
  color: #fff;
}

.diagram-card__link--l3 {
  border-color: #7c3aed;
  color: #4c1d95;
}

.diagram-card__link--l3:hover {
  background: #7c3aed;
  color: #fff;
}

/* Levels section */
.levels-section {
  padding: var(--goa-space-3xl) 0;
  background: var(--goa-color-greyscale-50);
}

.section-title {
  text-align: center;
  color: var(--goa-color-text-default);
}

.section-subtitle {
  text-align: center;
  color: var(--goa-color-text-secondary);
  margin: calc(-1 * var(--goa-space-s)) 0 var(--goa-space-2xl) 0;
}

.levels-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--goa-space-xl);
}

@media screen and (max-width: 700px) {
  .levels-grid {
    grid-template-columns: 1fr;
  }
}

.level-card {
  background: var(--goa-color-greyscale-white);
  border-radius: var(--goa-border-radius-xl);
  padding: var(--goa-space-xl);
  box-shadow: var(--goa-shadow-200);
  border-top: 4px solid var(--level-colour, var(--goa-color-brand-default));
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-m);
  transition: box-shadow var(--goa-transition-base), transform var(--goa-transition-base);
}

.level-card:hover {
  box-shadow: var(--goa-shadow-400);
  transform: translateY(-3px);
}

.level-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.level-card__icon {
  font-size: 2rem;
  line-height: 1;
}

.level-card__title {
  font-size: var(--goa-font-size-6);
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-text-default);
  margin: 0;
}

.level-card__json-title {
  font-size: var(--goa-font-size-2);
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-text-secondary);
  margin: calc(-1 * var(--goa-space-xs)) 0 0 0;
}

.level-card__subtitle {
  font-size: var(--goa-font-size-3);
  font-weight: var(--goa-font-weight-medium);
  color: var(--level-colour, var(--goa-color-brand-default));
  margin: 0;
}

.level-card__description {
  font-size: var(--goa-font-size-3);
  color: var(--goa-color-text-secondary);
  line-height: var(--goa-line-height-3);
  margin: 0;
  flex: 1;
}

.level-card__meta {
  font-size: var(--goa-font-size-2);
  color: var(--goa-color-text-secondary);
}

.level-card__count {
  font-weight: var(--goa-font-weight-medium);
}

.level-card__featured {
  background: var(--goa-color-greyscale-50);
  border-radius: var(--goa-border-radius-l);
  padding: var(--goa-space-m);
}

.level-card__featured-label {
  font-size: var(--goa-font-size-1);
  font-weight: var(--goa-font-weight-bold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--goa-color-text-secondary);
  margin: 0 0 var(--goa-space-s) 0;
}

.level-card__featured-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-xs);
}

.level-card__featured-item {
  display: flex;
  align-items: flex-start;
  gap: var(--goa-space-xs);
  font-size: var(--goa-font-size-2);
  color: var(--goa-color-text-default);
  line-height: 1.4;
}

.level-card__featured-icon {
  flex-shrink: 0;
  font-size: 0.9em;
}

.level-card__cta {
  align-self: flex-start;
  margin-top: auto;
}

/* AI CTA section */
.ai-cta-section {
  padding: var(--goa-space-3xl) 0;
  background: linear-gradient(135deg, var(--goa-color-info-background) 0%, var(--goa-color-brand-light) 100%);
}

.ai-cta-section__inner {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--goa-space-2xl);
  align-items: center;
}

@media screen and (max-width: 768px) {
  .ai-cta-section__inner {
    grid-template-columns: 1fr;
  }
}

.ai-cta-section__title {
  color: var(--goa-color-info-default);
}

.ai-cta-section__description {
  color: var(--goa-color-text-secondary);
  line-height: var(--goa-line-height-4);
  margin: 0 0 var(--goa-space-xl) 0;
}

.ai-cta-section__visual {
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-m);
}

.ai-cta-section__bubble {
  background: var(--goa-color-greyscale-white);
  border-radius: var(--goa-border-radius-xl);
  padding: var(--goa-space-m) var(--goa-space-l);
  box-shadow: var(--goa-shadow-200);
  max-width: 85%;
  border-bottom-left-radius: 4px;
}

.ai-cta-section__bubble p {
  margin: 0;
  font-size: var(--goa-font-size-3);
  color: var(--goa-color-text-default);
}

.ai-cta-section__bubble--user {
  align-self: flex-end;
  background: var(--goa-color-brand-default);
  border-bottom-left-radius: var(--goa-border-radius-xl);
  border-bottom-right-radius: 4px;
}

.ai-cta-section__bubble--user p {
  color: var(--goa-color-text-light);
}
</style>
