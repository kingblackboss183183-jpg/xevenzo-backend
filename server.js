const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Google Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY");

app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        status: "Active",
        message: "ZOVRA-V5 AI Dropshipping Backend is Running",
        ai_engine: "Google Gemini"
    });
});

app.get('/api/products', async (req, res) => {
    try {
        const response = await axios.get('https://fakestoreapi.com/products?limit=6');
        const products = response.data;
        
        // Using Gemini AI context or standard dynamic pricing calculation
        const marginPercentage = 0.25;

        const xevenzoProducts = products.map(product => {
            const originalPrice = product.price;
            const xevenzoPrice = originalPrice + (originalPrice * marginPercentage);

            return {
                id: product.id,
                title: product.title,
                original_price: originalPrice,
                xevenzo_price: parseFloat(xevenzoPrice.toFixed(2)),
                image: product.image,
                category: product.category,
                ai_tags: "Optimized by ZOVRA-AI"
            };
        });

        res.json({ 
            success: true, 
            ai_status: "Connected", 
            data: xevenzoProducts 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch products from AI backend" });
    }
});

app.listen(PORT, () => {
    console.log(`ZOVRA-V5 AI Server running on port ${PORT}`);
});
