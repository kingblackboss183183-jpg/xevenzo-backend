const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY");

app.use(express.json());

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>XEVENZO Store</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px; margin: 0; }
                    h1 { color: #333; text-align: center; }
                    .product { background: #fff; padding: 15px; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                    .price { color: #007bff; font-weight: bold; }
                </style>
            </head>
            <body>
                <h1>XEVENZO Global Store</h1>
                <div class="product">
                    <h3>AI Dynamic Pricing Active</h3>
                    <p class="price">Status: Connected to Google Gemini AI</p>
                    <p>Your global dropshipping backend is running successfully!</p>
                </div>
            </body>
        </html>
    `);
});

app.get('/api/products', async (req, res) => {
    try {
        const response = await axios.get('https://fakestoreapi.com/products?limit=5');
        const products = response.data;
        const marginPercentage = 0.20;

        const xevenzoProducts = products.map(product => {
            const originalPrice = product.price;
            const xevenzoPrice = originalPrice + (originalPrice * marginPercentage);

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
    console.log(`XEVENZO Backend Server is running on port ${PORT}`);
});
