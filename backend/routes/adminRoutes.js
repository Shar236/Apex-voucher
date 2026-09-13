import { Router } from 'express';
import {
  dashboardOverview,
  listUsers,
  getUser,
  setUserStatus,
  listAdminProducts,
  getAdminProduct,
  createProduct,
  updateProduct,
  quickUpdatePrice,
  quickUpdateStatus,
  quickUpdateFeatured,
  deleteProduct,
  duplicateProduct,
  archiveProduct,
  restoreProduct,
  reorderProducts,
  getProductInventory,
  listVouchers,
  getVoucherInventoryByProduct,
  getVoucherCodeUnmasked,
  addVouchers,
  updateVoucher,
  deleteVoucher,
  bulkDeleteVouchers,
  previewVoucherDelete,
  bulkSetVoucherStatus,
  getAdminNotifications,
  listOrdersAdmin,
  updateOrderStatus,
  resendOrderEmail,
  sendTestEmail,
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  toggleCampaignStatus,
  getWebsiteSettings,
  updateWebsiteSettings,
  listPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  listAuditLogs,
  exportCSV,
  listAdminVideos,
  getAdminVideo,
  createVideo,
  updateVideo,
  quickToggleFeaturedVideo,
  quickTogglePublishVideo,
  quickUpdateOrderVideo,
  bulkReorderVideos,
  deleteVideo,
  updateVideoSettings,
  uploadMedia,
  uploadProductLogo,
  uploadProductImage,
  uploadProductScreenshot,
  listVoucherRequestsAdmin,
  getVoucherRequestAdmin,
  updateVoucherRequestAdmin,
} from '../controllers/adminController.js';
import { getOrderByIdAdmin } from '../controllers/orderController.js';
import {
  listPTEBookingRequestsAdmin,
  getPTEBookingRequestAdmin,
  updatePTEBookingRequestAdmin,
} from '../controllers/pteBookingController.js';
import {
  listAdminAwards,
  getAdminAward,
  createAward,
  updateAward,
  deleteAward,
  quickToggleFeaturedAward,
  quickToggleStatusAward,
  quickUpdateOrderAward,
  bulkReorderAwards,
  uploadAwardMedia,
} from '../controllers/awardController.js';
import { protectAdmin } from '../middleware/auth.js';
import { mediaUpload, productLogoUpload, productImageUpload, awardMediaUpload } from '../middleware/upload.js';
import pteBookingProductRoutes from './pteBookingProductRoutes.js';

const r = Router();

r.use(protectAdmin);

r.get('/dashboard', dashboardOverview);

r.get('/users', listUsers);
r.get('/users/:id', getUser);
r.patch('/users/:id/status', setUserStatus);

r.get('/products', listAdminProducts);
r.patch('/products/reorder', reorderProducts);
r.post('/products/logo-upload', productLogoUpload.single('logo'), uploadProductLogo);
r.post('/products/image-upload', productImageUpload.single('image'), uploadProductImage);
r.post('/products/screenshot-upload', productImageUpload.single('image'), uploadProductScreenshot);
r.get('/products/:id', getAdminProduct);
r.post('/products', createProduct);
r.patch('/products/:id', updateProduct);
r.patch('/products/:id/price', quickUpdatePrice);
r.patch('/products/:id/status', quickUpdateStatus);
r.patch('/products/:id/featured', quickUpdateFeatured);
r.post('/products/:id/duplicate', duplicateProduct);
r.patch('/products/:id/archive', archiveProduct);
r.patch('/products/:id/restore', restoreProduct);
r.delete('/products/:id', deleteProduct);
r.get('/products/:id/inventory', getProductInventory);

r.get('/vouchers', listVouchers);
r.get('/vouchers/summary-by-product', getVoucherInventoryByProduct);
r.get('/vouchers/:id/reveal', getVoucherCodeUnmasked);
r.post('/vouchers', addVouchers);
r.post('/vouchers/bulk', addVouchers);
// Literal paths are declared before '/vouchers/:id' so they are not shadowed by it.
r.post('/vouchers/delete-preview', previewVoucherDelete);
r.post('/vouchers/bulk-delete', bulkDeleteVouchers);
r.patch('/vouchers/status', bulkSetVoucherStatus);
r.patch('/vouchers/:id', updateVoucher);
r.delete('/vouchers/:id', deleteVoucher);

r.get('/notifications', getAdminNotifications);

r.get('/orders', listOrdersAdmin);
r.get('/orders/:id', getOrderByIdAdmin);
r.patch('/orders/:id/status', updateOrderStatus);
r.post('/orders/:id/resend-email', resendOrderEmail);

r.get('/promotions', listPromotions);
r.post('/promotions', createPromotion);
r.patch('/promotions/:id', updatePromotion);
r.delete('/promotions/:id', deletePromotion);

r.get('/campaigns', listCampaigns);
r.post('/campaigns', createCampaign);
r.patch('/campaigns/:id', updateCampaign);
r.delete('/campaigns/:id', deleteCampaign);
r.post('/campaigns/:id/toggle', toggleCampaignStatus);

r.get('/website-settings', getWebsiteSettings);
r.patch('/website-settings', updateWebsiteSettings);

// ── Videos & Reels Management Endpoints ──────────────────────────────────────────
const uploadHandler = mediaUpload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]);

// /api/admin/videos
r.get('/videos', listAdminVideos);
r.get('/videos/:id', getAdminVideo);
r.post('/videos', createVideo);
r.post('/videos/upload', uploadHandler, uploadMedia);
r.patch('/videos/settings', updateVideoSettings);
r.patch('/videos/reorder', bulkReorderVideos);
r.patch('/videos/:id', updateVideo);
r.put('/videos/:id', updateVideo);
r.patch('/videos/:id/featured', quickToggleFeaturedVideo);
r.patch('/videos/:id/publish', quickTogglePublishVideo);
r.patch('/videos/:id/status', quickTogglePublishVideo);
r.patch('/videos/:id/order', quickUpdateOrderVideo);
r.delete('/videos/:id', deleteVideo);

// /api/admin/reels (aliases matching requirements)
r.get('/reels', listAdminVideos);
r.get('/reels/:id', getAdminVideo);
r.post('/reels', createVideo);
r.post('/reels/upload', uploadHandler, uploadMedia);
r.patch('/reels/settings', updateVideoSettings);
r.patch('/reels/reorder', bulkReorderVideos);
r.patch('/reels/:id', updateVideo);
r.put('/reels/:id', updateVideo);
r.patch('/reels/:id/featured', quickToggleFeaturedVideo);
r.patch('/reels/:id/publish', quickTogglePublishVideo);
r.patch('/reels/:id/status', quickTogglePublishVideo);
r.patch('/reels/:id/order', quickUpdateOrderVideo);
r.delete('/reels/:id', deleteVideo);

// ── Awards & Achievements Management Endpoints ───────────────────────────────
const awardUploadHandler = awardMediaUpload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 },
]);

// /api/admin/awards
r.get('/awards', listAdminAwards);
r.get('/awards/:id', getAdminAward);
r.post('/awards', createAward);
r.post('/awards/upload', awardUploadHandler, uploadAwardMedia);
r.patch('/awards/reorder', bulkReorderAwards);
r.patch('/awards/:id', updateAward);
r.put('/awards/:id', updateAward);
r.patch('/awards/:id/featured', quickToggleFeaturedAward);
r.patch('/awards/:id/status', quickToggleStatusAward);
r.patch('/awards/:id/order', quickUpdateOrderAward);
r.delete('/awards/:id', deleteAward);

r.get('/pte-bookings', listPTEBookingRequestsAdmin);
r.get('/pte-bookings/:id', getPTEBookingRequestAdmin);
r.patch('/pte-bookings/:id', updatePTEBookingRequestAdmin);

// PTE Exam Booking storefront products + page content (draft/publish + audit).
r.use(pteBookingProductRoutes);

r.get('/voucher-requests', listVoucherRequestsAdmin);
r.get('/voucher-requests/:id', getVoucherRequestAdmin);
r.patch('/voucher-requests/:id', updateVoucherRequestAdmin);

r.get('/audit-logs', listAuditLogs);
r.get('/export/:resource', exportCSV);

r.post('/email/test', sendTestEmail);

export default r;
