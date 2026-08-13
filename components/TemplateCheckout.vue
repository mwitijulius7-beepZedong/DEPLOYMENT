<template>
  <article class="template-checkout">
    <!-- Back button -->
    <button class="back-btn" @click="$emit('close')" type="button" aria-label="Back to template preview">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="19" y1="12" x2="5" y2="12"></line>
        <polyline points="12 19 5 12 12 5"></polyline>
      </svg>
      <span>Back</span>
    </button>

    <!-- Preview area -->
    <div class="checkout-preview" aria-label="Template preview">
      <div class="preview-placeholder" v-if="!previewImage">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <span>Template preview</span>
      </div>
      <img v-else :src="previewImage" :alt="templateName" class="preview-image" />
    </div>

    <!-- Template info -->
    <div class="checkout-info">
      <h2 class="template-name">{{ templateName }}</h2>
      <p class="template-features">{{ featuresText }}</p>
    </div>

    <!-- Price row -->
    <div class="price-row">
      <div class="price-label">
        <span class="price-label-text">One-time price</span>
      </div>
      <div class="price-value">KES {{ templatePrice.toLocaleString() }}</div>
    </div>

    <!-- Payment method selector -->
    <fieldset class="payment-methods" role="radiogroup" aria-label="Payment method">
      <legend class="payment-methods-label">Pay with</legend>
      <div class="payment-options">
        <label 
          v-for="method in paymentMethods" 
          :key="method.id" 
          class="payment-option"
          :class="{ selected: selectedPaymentMethod === method.id }"
        >
          <input 
            type="radio" 
            :name="paymentGroupName" 
            :value="method.id" 
            v-model="selectedPaymentMethod"
            class="payment-radio"
            :id="method.id"
          >
          <span class="payment-option-content">
            <svg v-if="method.icon" class="payment-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <component :is="method.iconComponent" v-bind="method.iconProps" />
            </svg>
            <span class="payment-option-label">{{ method.label }}</span>
          </span>
          <svg v-if="selectedPaymentMethod === method.id" class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </label>
      </div>
    </fieldset>

    <!-- Payment form (shown for M-Pesa) -->
    <div class="payment-form" v-if="selectedPaymentMethod === 'mpesa' && paymentState === 'form'">
      <div class="form-group">
        <label for="checkout-name">Full name</label>
        <input type="text" id="checkout-name" v-model="formData.name" placeholder="John Doe" required autocomplete="name" />
      </div>
      <div class="form-group">
        <label for="checkout-email">Email address</label>
        <input type="email" id="checkout-email" v-model="formData.email" placeholder="you@example.com" required autocomplete="email" />
        <p class="form-hint">Your license key will be sent to this email</p>
      </div>
      <div class="form-group">
        <label for="checkout-phone">M-Pesa phone number</label>
        <input type="tel" id="checkout-phone" v-model="formData.phone" placeholder="0712345678" required autocomplete="tel" />
        <p class="form-hint">Format: 0712345678 or 254712345678</p>
      </div>
    </div>

    <!-- Payment form for Card -->
    <div class="payment-form" v-if="selectedPaymentMethod === 'card' && paymentState === 'form'">
      <div class="form-group">
        <label for="checkout-name">Full name</label>
        <input type="text" id="checkout-name" v-model="formData.name" placeholder="John Doe" required autocomplete="name" />
      </div>
      <div class="form-group">
        <label for="checkout-email">Email address</label>
        <input type="email" id="checkout-email" v-model="formData.email" placeholder="you@example.com" required autocomplete="email" />
        <p class="form-hint">Your license key will be sent to this email</p>
      </div>
      <div class="form-group">
        <label for="checkout-card">Card details</label>
        <div class="card-inputs">
          <input type="text" id="checkout-card" v-model="formData.cardNumber" placeholder="1234 5678 9012 3456" maxlength="19" @input="formatCardNumber" autocomplete="cc-number" />
          <input type="text" v-model="formData.cardExpiry" placeholder="MM/YY" maxlength="5" @input="formatCardExpiry" autocomplete="cc-exp" />
          <input type="text" v-model="formData.cardCvc" placeholder="CVC" maxlength="4" autocomplete="cc-csc" />
        </div>
      </div>
    </div>

    <!-- Processing state -->
    <div class="payment-processing" v-if="paymentState === 'processing'">
      <div class="processing-spinner" aria-hidden="true"></div>
      <p>Processing payment<span class="dots"><span>.</span><span>.</span><span>.</span></span></p>
      <p class="processing-detail" v-if="selectedPaymentMethod === 'mpesa'">Check your phone for the M-Pesa prompt</p>
    </div>

    <!-- Success state -->
    <div class="payment-success" v-if="paymentState === 'success'">
      <div class="success-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      </div>
      <h3>Payment successful!</h3>
      <p>Thank you, {{ formData.name }}! Your template license has been generated.</p>
      <div class="license-key">
        <code>{{ licenseKey }}</code>
        <button class="copy-btn" @click="copyLicenseKey" :disabled="keyCopied" type="button">
          {{ keyCopied ? 'Copied!' : 'Copy key' }}
        </button>
      </div>
      <p class="success-note">Save this key — you'll need it to activate the template.</p>
    </div>

    <!-- Error state -->
    <div class="payment-error" v-if="paymentState === 'failed'">
      <div class="error-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      </div>
      <h3>Payment failed</h3>
      <p>{{ paymentError || 'The payment could not be completed. You were not charged. Please try again.' }}</p>
      <button class="retry-btn" @click="resetPaymentForm" type="button">Try again</button>
    </div>

    <!-- Submit button -->
    <button 
      v-if="paymentState === 'form'" 
      class="checkout-submit" 
      @click="submitPayment"
      :disabled="!isFormValid || isProcessing"
      type="button"
    >
      <span v-if="isProcessing" class="btn-spinner" aria-hidden="true"></span>
      <span v-else>{{ submitButtonText }}</span>
    </button>

    <div class="checkout-footer">
      <p>Secure checkout · License delivered instantly via email</p>
    </div>
  </article>
</template>

<script>
export default {
  name: 'TemplateCheckout',
  props: {
    templatePrice: {
      type: Number,
      default: 1000
    },
    templateName: {
      type: String,
      default: 'Blog Template Pro'
    },
    previewImage: {
      type: String,
      default: ''
    },
    featuresText: {
      type: String,
      default: 'Responsive · Dark mode · SEO ready · Fast loading'
    }
  },
  emits: ['close', 'purchase-complete'],
  data() {
    return {
      selectedPaymentMethod: 'mpesa',
      paymentState: 'form', // 'form', 'processing', 'success', 'failed'
      paymentGroupName: `payment-method-${Date.now()}`,
      isProcessing: false,
      paymentError: '',
      licenseKey: '',
      keyCopied: false,
      formData: {
        name: '',
        email: '',
        phone: '',
        cardNumber: '',
        cardExpiry: '',
        cardCvc: ''
      }
    };
  },
  computed: {
    paymentMethods() {
      return [
        { 
          id: 'mpesa', 
          label: 'M-Pesa', 
          icon: 'mpesa',
          iconComponent: 'path',
          iconProps: { d: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' }
        },
        { 
          id: 'card', 
          label: 'Card', 
          icon: 'card',
          iconComponent: 'rect',
          iconProps: { x: '2', y: '4', width: '20', height: '16', rx: '2' }
        }
      ];
    },
    isFormValid() {
      if (this.selectedPaymentMethod === 'mpesa') {
        return this.formData.name.trim() && 
               this.formData.email.trim() && 
               this.isValidEmail(this.formData.email) &&
               this.formData.phone.trim();
      }
      return this.formData.name.trim() && 
             this.formData.email.trim() && 
             this.isValidEmail(this.formData.email) &&
             this.formData.cardNumber.replace(/\s/g, '').length >= 15 &&
             this.formData.cardExpiry.length === 5 &&
             this.formData.cardCvc.length >= 3;
    },
    submitButtonText() {
      const methodLabel = this.selectedPaymentMethod === 'mpesa' ? 'M-Pesa' : 'Card';
      return `Pay KES ${this.templatePrice.toLocaleString()} with ${methodLabel}`;
    }
  },
  methods: {
    isValidEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },
    formatCardNumber(e) {
      let value = e.target.value.replace(/\D/g, '');
      value = value.replace(/(\d{4})/g, '$1 ').trim();
      this.formData.cardNumber = value.substring(0, 19);
    },
    formatCardExpiry(e) {
      let value = e.target.value.replace(/\D/g, '');
      if (value.length >= 2) {
        value = value.substring(0, 2) + '/' + value.substring(2, 4);
      }
      this.formData.cardExpiry = value.substring(0, 5);
    },
    async submitPayment() {
      if (!this.isFormValid || this.isProcessing) return;
      
      this.isProcessing = true;
      this.paymentState = 'processing';
      
      try {
        const payload = {
          name: this.formData.name.trim(),
          email: this.formData.email.trim(),
          payment_method: this.selectedPaymentMethod
        };
        
        if (this.selectedPaymentMethod === 'mpesa') {
          payload.phone = this.formData.phone.trim().replace(/\D/g, '');
        } else {
          payload.card_token = 'tok_' + Date.now(); // In real app, use Stripe.js or similar
        }
        
        const response = await fetch('/api/template/purchase', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionStorage.getItem('authToken') || ''}`
          },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          this.paymentState = 'success';
          this.licenseKey = data.license_key || 'LIC-' + Date.now().toString(36).toUpperCase();
          this.$emit('purchase-complete', data);
        } else {
          this.paymentState = 'failed';
          this.paymentError = data.message || 'Payment failed. Please try again.';
        }
      } catch (error) {
        console.error('Payment error:', error);
        this.paymentState = 'failed';
        this.paymentError = 'Network error. Please check your connection and try again.';
      } finally {
        this.isProcessing = false;
      }
    },
    resetPaymentForm() {
      this.paymentState = 'form';
      this.paymentError = '';
      this.isProcessing = false;
    },
    copyLicenseKey() {
      navigator.clipboard.writeText(this.licenseKey).then(() => {
        this.keyCopied = true;
        setTimeout(() => { this.keyCopied = false; }, 2000);
      }).catch(() => {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = this.licenseKey;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.keyCopied = true;
        setTimeout(() => { this.keyCopied = false; }, 2000);
      });
    }
  }
};
</script>

<style scoped>
.template-checkout {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  padding: 1.5rem;
  background: var(--card-bg, var(--bg-secondary, #ffffff));
  max-width: 100%;
  box-sizing: border-box;
  animation: slideIn 0.2s ease-out;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

[data-theme="dark"] .template-checkout {
  --border-color: #334155;
  --card-bg: var(--bg-secondary, #1e293b);
}

/* Back button */
.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  background: none;
  border: none;
  padding: 0.375rem 0.5rem;
  margin-bottom: 1rem;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-medium, #475569);
  cursor: pointer;
  border-radius: 6px;
  transition: color 0.15s ease, background-color 0.15s ease;
}

[data-theme="dark"] .back-btn {
  color: var(--text-light, #94a3b8);
}

.back-btn:hover {
  color: var(--text-dark, #0f172a);
  background: var(--bg-tertiary, #f1f5f9);
}

[data-theme="dark"] .back-btn:hover {
  color: var(--text-dark, #f1f5f9);
  background: var(--bg-tertiary, #334155);
}

.back-btn:focus-visible {
  outline: 2px solid var(--primary-color, #6366f1);
  outline-offset: 2px;
}

.back-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* Preview area */
.checkout-preview {
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-tertiary, #f1f5f9);
  margin-bottom: 1rem;
}

[data-theme="dark"] .checkout-preview {
  border-color: #334155;
  background: var(--bg-tertiary, #334155);
}

.preview-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--text-muted, #94a3b8);
  font-size: 13px;
}

.preview-placeholder svg {
  width: 40px;
  height: 40px;
  opacity: 0.5;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Template info */
.checkout-info {
  margin-bottom: 1rem;
}

.template-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-dark, #0f172a);
  margin: 0 0 0.375rem 0;
  line-height: 1.3;
}

[data-theme="dark"] .template-name {
  color: var(--text-dark, #f1f5f9);
}

.template-features {
  font-size: 13px;
  color: var(--text-muted, #94a3b8);
  margin: 0;
  line-height: 1.5;
}

[data-theme="dark"] .template-features {
  color: var(--text-light, #64748b);
}

/* Price row */
.price-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0.875rem 1rem;
  background: var(--bg-tertiary, #f1f5f9);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  margin-bottom: 1.25rem;
}

[data-theme="dark"] .price-row {
  background: var(--bg-tertiary, #334155);
  border-color: #334155;
}

.price-label-text {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

[data-theme="dark"] .price-label-text {
  color: var(--text-light, #64748b);
}

.price-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-dark, #0f172a);
}

[data-theme="dark"] .price-value {
  color: var(--text-dark, #f1f5f9);
}

/* Payment methods */
.payment-methods {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.25rem;
}

[data-theme="dark"] .payment-methods {
  border-color: #334155;
}

.payment-methods-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0 0.25rem 0.5rem;
  margin: -1rem -1rem 0.5rem -1rem;
}

[data-theme="dark"] .payment-methods-label {
  color: var(--text-light, #64748b);
}

.payment-options {
  display: flex;
  gap: 0.5rem;
}

.payment-option {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 6px;
  background: var(--card-bg, var(--bg-secondary, #ffffff));
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

[data-theme="dark"] .payment-option {
  border-color: #334155;
  background: var(--bg-secondary, #1e293b);
}

.payment-option:hover {
  border-color: var(--primary-color, #6366f1);
}

.payment-option.selected {
  border-color: var(--primary-color, #6366f1);
  background: var(--primary-light, rgba(99, 102, 241, 0.08));
}

[data-theme="dark"] .payment-option.selected {
  background: rgba(129, 140, 248, 0.12);
}

.payment-radio {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.payment-option-content {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-medium, #475569);
}

.payment-option.selected .payment-option-content {
  color: var(--primary-color, #6366f1);
}

[data-theme="dark"] .payment-option-content {
  color: var(--text-medium, #cbd5e1);
}

[data-theme="dark"] .payment-option.selected .payment-option-content {
  color: var(--primary-color, #818cf8);
}

.payment-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: inherit;
}

.check-icon {
  width: 16px;
  height: 16px;
  color: var(--primary-color, #6366f1);
  flex-shrink: 0;
}

/* Payment form */
.payment-form {
  margin-bottom: 1.25rem;
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-dark, #0f172a);
  margin-bottom: 0.375rem;
}

[data-theme="dark"] .form-group label {
  color: var(--text-dark, #f1f5f9);
}

.form-group input {
  width: 100%;
  padding: 0.625rem 0.875rem;
  font-size: 14px;
  color: var(--text-dark, #0f172a);
  background: var(--card-bg, var(--bg-secondary, #ffffff));
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 6px;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

[data-theme="dark"] .form-group input {
  color: var(--text-dark, #f1f5f9);
  background: var(--bg-secondary, #1e293b);
  border-color: #334155;
}

.form-group input:focus {
  outline: none;
  border-color: var(--primary-color, #6366f1);
  box-shadow: 0 0 0 3px var(--primary-light, rgba(99, 102, 241, 0.15));
}

[data-theme="dark"] .form-group input:focus {
  box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.2);
}

.form-group input::placeholder {
  color: var(--text-muted, #94a3b8);
}

[data-theme="dark"] .form-group input::placeholder {
  color: var(--text-light, #64748b);
}

.form-hint {
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
  margin: 0.375rem 0 0 0;
}

[data-theme="dark"] .form-hint {
  color: var(--text-light, #64748b);
}

.card-inputs {
  display: flex;
  gap: 0.5rem;
}

.card-inputs input {
  flex: 1;
  min-width: 0;
}

.card-inputs input:first-child {
  flex: 2;
}

/* Processing state */
.payment-processing {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  text-align: center;
  margin-bottom: 1.25rem;
}

.processing-spinner {
  width: 32px;
  height: 32px;
  border: 2px solid var(--border-color, #e2e8f0);
  border-top-color: var(--primary-color, #6366f1);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.payment-processing p {
  font-size: 14px;
  color: var(--text-medium, #475569);
  margin: 0 0 0.5rem 0;
}

.payment-processing .dots {
  display: inline-flex;
  gap: 2px;
}

.payment-processing .dots span {
  animation: dotPulse 1.4s infinite ease-in-out both;
}

.payment-processing .dots span:nth-child(1) { animation-delay: -0.32s; }
.payment-processing .dots span:nth-child(2) { animation-delay: -0.16s; }

@keyframes dotPulse {
  0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

.processing-detail {
  font-size: 13px !important;
  color: var(--text-muted, #94a3b8) !important;
}

/* Success state */
.payment-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 1.5rem 1rem;
  margin-bottom: 1.25rem;
}

.success-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #dcfce7;
  color: #166534;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}

[data-theme="dark"] .success-icon {
  background: #14532d;
  color: #86efac;
}

.success-icon svg {
  width: 24px;
  height: 24px;
}

.payment-success h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-dark, #0f172a);
  margin: 0 0 0.5rem 0;
}

[data-theme="dark"] .payment-success h3 {
  color: var(--text-dark, #f1f5f9);
}

.payment-success > p {
  font-size: 14px;
  color: var(--text-medium, #475569);
  margin: 0 0 1rem 0;
  max-width: 320px;
}

[data-theme="dark"] .payment-success > p {
  color: var(--text-medium, #cbd5e1);
}

.license-key {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: var(--bg-tertiary, #f1f5f9);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  margin-bottom: 0.75rem;
  width: 100%;
  max-width: 360px;
  box-sizing: border-box;
}

[data-theme="dark"] .license-key {
  background: var(--bg-tertiary, #334155);
  border-color: #334155;
}

.license-key code {
  flex: 1;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 14px;
  color: var(--text-dark, #0f172a);
  background: none;
  padding: 0;
  text-align: center;
  letter-spacing: 0.05em;
}

[data-theme="dark"] .license-key code {
  color: var(--text-dark, #f1f5f9);
}

.copy-btn {
  padding: 0.5rem 1rem;
  font-size: 12px;
  font-weight: 500;
  color: var(--primary-color, #6366f1);
  background: var(--primary-light, rgba(99, 102, 241, 0.1));
  border: 1px solid var(--primary-color, #6366f1);
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

[data-theme="dark"] .copy-btn {
  background: rgba(129, 140, 248, 0.15);
  border-color: var(--primary-color, #818cf8);
  color: var(--primary-color, #818cf8);
}

.copy-btn:hover:not(:disabled) {
  background: var(--primary-color, #6366f1);
  color: #fff;
}

[data-theme="dark"] .copy-btn:hover:not(:disabled) {
  background: var(--primary-color, #818cf8);
}

.copy-btn:disabled {
  opacity: 0.7;
  cursor: default;
}

.success-note {
  font-size: 12px !important;
  color: var(--text-muted, #94a3b8) !important;
  margin: 0 !important;
}

/* Error state */
.payment-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 1.5rem 1rem;
  margin-bottom: 1.25rem;
}

.error-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #fef2f2;
  color: #dc2626;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}

[data-theme="dark"] .error-icon {
  background: #450a0a;
  color: #fca5a5;
}

.error-icon svg {
  width: 24px;
  height: 24px;
}

.payment-error h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-dark, #0f172a);
  margin: 0 0 0.5rem 0;
}

[data-theme="dark"] .payment-error h3 {
  color: var(--text-dark, #f1f5f9);
}

.payment-error > p {
  font-size: 14px;
  color: var(--text-medium, #475569);
  margin: 0 0 1rem 0;
  max-width: 320px;
}

[data-theme="dark"] .payment-error > p {
  color: var(--text-medium, #cbd5e1);
}

.retry-btn {
  padding: 0.625rem 1.5rem;
  font-size: 13px;
  font-weight: 500;
  color: var(--primary-color, #6366f1);
  background: var(--primary-light, rgba(99, 102, 241, 0.1));
  border: 1px solid var(--primary-color, #6366f1);
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

[data-theme="dark"] .retry-btn {
  background: rgba(129, 140, 248, 0.15);
  border-color: var(--primary-color, #818cf8);
  color: var(--primary-color, #818cf8);
}

.retry-btn:hover {
  background: var(--primary-color, #6366f1);
  color: #fff;
}

[data-theme="dark"] .retry-btn:hover {
  background: var(--primary-color, #818cf8);
}

/* Submit button */
.checkout-submit {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.875rem 1.5rem;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: var(--primary-color, #6366f1);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease, opacity 0.15s ease;
  margin-bottom: 1rem;
}

.checkout-submit:hover:not(:disabled) {
  background: var(--primary-hover, #4f46e5);
}

[data-theme="dark"] .checkout-submit:hover:not(:disabled) {
  background: var(--primary-hover, #4f46e5);
}

.checkout-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkout-submit:focus-visible {
  outline: 2px solid var(--primary-color, #6366f1);
  outline-offset: 2px;
}

.btn-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* Footer */
.checkout-footer {
  text-align: center;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color, #e2e8f0);
}

[data-theme="dark"] .checkout-footer {
  border-color: #334155;
}

.checkout-footer p {
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
  margin: 0;
}

[data-theme="dark"] .checkout-footer p {
  color: var(--text-light, #64748b);
}

/* Responsive */
@media (max-width: 480px) {
  .template-checkout {
    padding: 1.25rem;
  }
  
  .payment-options {
    flex-direction: column;
  }
  
  .card-inputs {
    flex-direction: column;
  }
  
  .card-inputs input {
    width: 100%;
  }
}
</style>