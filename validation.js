// validation.js - Server-side validation helpers.
// The backend is the authority; frontend checks are only for UX.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 120;
const EMAIL_MAX = 254;
const CARD_NUM_MAX = 50;
const MESSAGE_MAX = 1000;
// Business rule: a single cash gift cannot exceed this amount.
const MAX_AMOUNT = 100000000;

function validateName(value) {
  if (typeof value !== 'string' || value.trim() === '') return 'Name is required.';
  if (value.trim().length > NAME_MAX) return 'Name is too long.';
  return null;
}

function validateEmail(value) {
  if (typeof value !== 'string' || value.trim() === '') return 'Email is required.';
  const email = value.trim();
  if (email.length > EMAIL_MAX) return 'Email is too long.';
  if (!EMAIL_RE.test(email)) return 'Email address is invalid.';
  return null;
}

function validateOptionalText(value, label, max) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return `${label} is invalid.`;
  if (value.trim().length > max) return `${label} is too long.`;
  return null;
}

function validateAmount(value) {
  if (value === undefined || value === null || value === '') return 'Amount is required.';
  if (typeof value !== 'string' && typeof value !== 'number') return 'Amount must be a valid number.';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Amount must be a valid number.';
  if (n <= 0) return 'Amount must be greater than zero.';
  if (n > MAX_AMOUNT) return 'Amount is too large.';
  return null;
}

// Returns { errors: [..] } or { errors: [], values: {...normalized} }
function validateCash(input) {
  const errors = [];
  const nameError = validateName(input.full_name);
  if (nameError) errors.push(nameError);
  const emailError = validateEmail(input.email);
  if (emailError) errors.push(emailError);
  const amountError = validateAmount(input.amount);
  if (amountError) errors.push(amountError);
  const cardError = validateOptionalText(input.card_num, 'Invitation card number', CARD_NUM_MAX);
  if (cardError) errors.push(cardError);
  const msgError = validateOptionalText(input.message, 'Message', MESSAGE_MAX);
  if (msgError) errors.push(msgError);

  if (errors.length) return { errors };

  const amount = Math.round(Number(input.amount) * 100) / 100;
  return {
    errors: [],
    values: {
      full_name: String(input.full_name).trim(),
      email: String(input.email).trim().toLowerCase(),
      amount,
      card_num: input.card_num ? String(input.card_num).trim() : null,
      message: input.message ? String(input.message).trim() : null,
      request_id: input.request_id ? String(input.request_id).slice(0, 100) : null
    }
  };
}

function validateGiftClaim(input) {
  const errors = [];
  const nameError = validateName(input.guest_name);
  if (nameError) errors.push(nameError);
  const emailError = validateEmail(input.email);
  if (emailError) errors.push(emailError);
  if (typeof input.item_id !== 'string' || input.item_id.trim() === '') {
    errors.push('Gift selection is required.');
  }
  const cardError = validateOptionalText(input.card_num, 'Invitation card number', CARD_NUM_MAX);
  if (cardError) errors.push(cardError);

  if (errors.length) return { errors };

  return {
    errors: [],
    values: {
      guest_name: String(input.guest_name).trim(),
      email: String(input.email).trim().toLowerCase(),
      card_num: input.card_num ? String(input.card_num).trim() : null,
      item_id: String(input.item_id).trim(),
      request_id: input.request_id ? String(input.request_id).slice(0, 100) : null
    }
  };
}

module.exports = { validateCash, validateGiftClaim, MAX_AMOUNT };
