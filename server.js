const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
    res.send('XEVENZO Global AI Backend is Running Securely!');
});

app.get('/api/products', async (req, res) => {
    try {
        const response = await axios.get('https://fakestoreapi.com/products?limit=5');
        const products = response.data;
        const xevenzoProducts = products.map(product => {
            const originalPrice = product.price;
            const xevenzoPrice = originalPrice + (originalPrice * 0.20);
            return {
                id: product.id,
                title: product.title,
                original_price: originalPrice,
                xevenzo_price: parseFloat(xevenzoPrice.toFixed(2)),
                image: product.image
            };
        });
        res.json({ success: true, data: xevenzoProducts });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch products" });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
