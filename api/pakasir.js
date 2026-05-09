const express = require('express');
const router = express.Router();
const axios = require('axios');
const PAKASIR_URL = 'https://app.pakasir.com/api';

function getParams(req) {
    const q = req.query || {};
    const b = req.body || {};
    return {
        project: b.project || q.project || '',
        order_id: b.order_id || q.order_id || '',
        amount: Number(b.amount || q.amount || 0),
        pakasir_api_key: b.pakasir_api_key || q.pakasir_api_key || ''
    };
}

router.all('/create', async (req, res) => {
    const { project, order_id, amount, pakasir_api_key } = getParams(req);
    if (!project || !order_id || !amount || !pakasir_api_key) {
        return res.status(400).json({ status: false, message: 'Parameter wajib: project, order_id, amount, pakasir_api_key' });
    }
    try {
        const response = await axios.post(`${PAKASIR_URL}/transactioncreate/qris`,
            { project, order_id, amount: parseInt(amount), api_key: pakasir_api_key },
            { headers: { 'Content-Type': 'application/json', 'User-Agent': 'RAMZZPAY/1.0' }, timeout: 15000 }
        );
        const data = response.data;
        if (data.payment) {
            return res.json({ status: true, message: 'Transaksi berhasil dibuat', data: {
                payment_method: data.payment.payment_method || 'qris',
                payment_number: data.payment.payment_number,
                total_payment: data.payment.total_payment,
                fee: data.payment.fee || 0,
                expired_at: data.payment.expired_at,
                project: data.payment.project,
                order_id: data.payment.order_id
            }});
        }
        return res.status(400).json({ status: false, message: data.message || 'Gagal membuat transaksi' });
    } catch (err) {
        return res.status(502).json({ status: false, message: 'Server Pakasir error: ' + err.message });
    }
});

router.all('/check', async (req, res) => {
    const { project, order_id, amount, pakasir_api_key } = getParams(req);
    if (!project || !order_id || !amount || !pakasir_api_key) {
        return res.status(400).json({ status: false, message: 'Parameter wajib: project, order_id, amount, pakasir_api_key' });
    }
    try {
        const response = await axios.get(`${PAKASIR_URL}/transactiondetail`, {
            params: { project, order_id, amount: parseInt(amount), api_key: pakasir_api_key },
            headers: { 'User-Agent': 'RAMZZPAY/1.0' }, timeout: 10000
        });
        return res.json({ status: true, message: 'Status transaksi ditemukan', data: response.data });
    } catch (err) {
        return res.status(502).json({ status: false, message: 'Server Pakasir error: ' + err.message });
    }
});

router.all('/cancel', async (req, res) => {
    const { project, order_id, amount, pakasir_api_key } = getParams(req);
    if (!project || !order_id || !amount || !pakasir_api_key) {
        return res.status(400).json({ status: false, message: 'Parameter wajib: project, order_id, amount, pakasir_api_key' });
    }
    try {
        const response = await axios.post(`${PAKASIR_URL}/transactioncancel`,
            { project, order_id, amount: parseInt(amount), api_key: pakasir_api_key },
            { headers: { 'Content-Type': 'application/json', 'User-Agent': 'RAMZZPAY/1.0' }, timeout: 10000 }
        );
        return res.json({ status: true, message: 'Transaksi berhasil dibatalkan', data: response.data });
    } catch (err) {
        return res.status(502).json({ status: false, message: 'Server Pakasir error: ' + err.message });
    }
});

router.get('/methods', (req, res) => {
    return res.json({ status: true, message: 'Daftar metode pembayaran', data: [
        { id: 'qris', name: 'QRIS', min: 1000, max: 5000000 },
        { id: 'va_bca', name: 'Virtual Account BCA', min: 10000, max: 100000000 },
        { id: 'va_mandiri', name: 'Virtual Account Mandiri', min: 10000, max: 100000000 },
        { id: 'va_bni', name: 'Virtual Account BNI', min: 10000, max: 100000000 },
        { id: 'va_bri', name: 'Virtual Account BRI', min: 10000, max: 100000000 }
    ]});
});

module.exports = router;