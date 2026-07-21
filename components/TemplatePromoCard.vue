<template>
  <article class="template-promo-card" v-if="showCard && !showCheckout">
    <div class="promo-badge">Template for sale</div>
    <h3 class="promo-heading">Like this blog's design?</h3>
    <p class="promo-copy">Get the exact template powering this blog — responsive, dark-mode ready, SEO-optimised, and fast.</p>
    <p class="promo-features">Responsive · Dark mode · SEO ready · Fast loading</p>
    <button 
      class="promo-cta" 
      @click="openCheckout"
      type="button"
    >
      <span>View template</span>
      <svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="5" y1="12" x2="19" y2="12"></line>
        <polyline points="12 5 19 12 12 19"></polyline>
      </svg>
    </button>
  </article>

  <template-checkout 
    v-if="showCheckout"
    :template-price="templatePrice"
    @close="closeCheckout"
    @purchase-complete="onPurchaseComplete"
  />
</template>

<script>
import TemplateCheckout from './TemplateCheckout.vue';

export default {
  name: 'TemplatePromoCard',
  components: {
    TemplateCheckout
  },
  props: {
    templatePrice: {
      type: Number,
      default: 1000
    },
    showCard: {
      type: Boolean,
      default: true
    }
  },
  data() {
    return {
      showCheckout: false
    };
  },
  methods: {
    openCheckout() {
      this.showCheckout = true;
      this.$emit('open-checkout');
    },
    closeCheckout() {
      this.showCheckout = false;
    },
    onPurchaseComplete() {
      this.showCheckout = false;
      this.$emit('purchase-complete');
    }
  }
};
</script>

<style scoped>
.template-promo-card {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
  background: var(--card-bg, var(--bg-secondary, #ffffff));
  max-width: 100%;
  box-sizing: border-box;
}

[data-theme="dark"] .template-promo-card {
  --border-color: #334155;
  --card-bg: var(--bg-secondary, #1e293b);
}

.promo-badge {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted, #94a3b8);
  text-transform: none;
  letter-spacing: 0.02em;
  margin-bottom: 0.5rem;
  display: block;
}

[data-theme="dark"] .promo-badge {
  color: var(--text-light, #94a3b8);
}

.promo-heading {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-dark, #0f172a);
  margin: 0 0 0.375rem 0;
  line-height: 1.4;
}

[data-theme="dark"] .promo-heading {
  color: var(--text-dark, #f1f5f9);
}

.promo-copy {
  font-size: 13px;
  color: var(--text-medium, #475569);
  margin: 0 0 0.5rem 0;
  line-height: 1.5;
}

[data-theme="dark"] .promo-copy {
  color: var(--text-medium, #cbd5e1);
}

.promo-features {
  font-size: 13px;
  color: var(--text-muted, #94a3b8);
  margin: 0 0 1rem 0;
  line-height: 1.5;
}

[data-theme="dark"] .promo-features {
  color: var(--text-light, #64748b);
}

.promo-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  padding: 0.5rem 1rem;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-dark, #0f172a);
  background: transparent;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;
}

[data-theme="dark"] .promo-cta {
  color: var(--text-dark, #f1f5f9);
  border-color: #334155;
}

.promo-cta:hover {
  border-color: var(--primary-color, #6366f1);
  background: var(--primary-light, rgba(99, 102, 241, 0.08));
  color: var(--primary-color, #6366f1);
}

[data-theme="dark"] .promo-cta:hover {
  border-color: var(--primary-color, #818cf8);
  background: rgba(129, 140, 248, 0.12);
  color: var(--primary-color, #818cf8);
}

.promo-cta:focus-visible {
  outline: 2px solid var(--primary-color, #6366f1);
  outline-offset: 2px;
}

.arrow-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: inherit;
  transition: transform 0.15s ease;
}

.promo-cta:hover .arrow-icon {
  transform: translateX(2px);
}
</style>