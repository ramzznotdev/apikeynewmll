require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files - serve landing page & docs
app.use(express.static(path.join(__dirname, '..')));

// Import routers
const orderkoutaRouter = require('./orderkouta');
const pakasirRouter = require('./pakasir');

// API Routes
app.use('/api/orderkouta', orderkoutaRouter);
app.use('/api/pakasir', pakasirRouter);

// Root - Landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Docs page
app.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'docs.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: true,
    message: 'RAMZZPAY API is running',
    timestamp: new Date().toISOString(),
    version: '2.6.0'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: false,
    message: 'Endpoint tidak ditemukan'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  res.status(500).json({
    status: false,
    message: 'Internal Server Error'
  });
});

// Export for Vercel
module.exports = app;

// Start server locally
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`RAMZZPAY API running on http://localhost:${PORT}`);
    console.log(`Documentation: http://localhost:${PORT}/docs`);
  });
}