import { AppError } from '../middleware/errorHandler.js';
import { sendContactFormNotification } from '../services/email.js';

const MAX_LENGTHS = {
  name: 120,
  email: 254,
  phone: 40,
  orderId: 100,
  subject: 180,
  category: 80,
  message: 5000,
};

const clean = (value, max) => String(value || '').trim().slice(0, max);

export const submitContact = async (req, res, next) => {
  try {
    const body = req.body || {};
    const contact = Object.fromEntries(Object.entries(MAX_LENGTHS).map(([key, max]) => [key, clean(body[key], max)]));

    if (!contact.name || !contact.email || !contact.subject || !contact.message) {
      return next(new AppError('Name, email, subject, and message are required.', 400, 'VALIDATION_ERROR'));
    }
    if (!/^\S+@\S+\.\S+$/.test(contact.email)) {
      return next(new AppError('Please provide a valid email address.', 400, 'VALIDATION_ERROR'));
    }

    const result = await sendContactFormNotification(contact);

    if (!result.sent) return next(new AppError('Contact email could not be sent. Please try again later.', 503, 'EMAIL_UNAVAILABLE'));
    res.status(201).json({ success: true, message: 'Your message has been sent.' });
  } catch (error) {
    next(error);
  }
};