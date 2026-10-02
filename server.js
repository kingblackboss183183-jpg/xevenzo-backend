const express = require('express');
const axios = require('axios');
const app = express();
const PORT = 3000;

app.use(express.json());

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

        res.json({
            success: true,
            data: xevenzoProducts
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch products" });
    }
});

app.post('/api/chat', (req, res) => {
    const userMessage = req.body.message;

    if (!userMessage) {
        return res.status(400).json({ error: "Message is required" });
    }

    let aiResponse = "";
    const msg = userMessage.toLowerCase();

    if (msg.includes("order") || msg.includes("track")) {
        aiResponse = "Hello! I am the XEVENZO AI Assistant. Your order is being processed for international shipping. You will receive a tracking link shortly.";
    } else if (msg.includes("complaint") || msg.includes("return")) {
        aiResponse = "I apologize for the inconvenience. As the XEVENZO AI manager, I have registered your complaint. We will initiate a refund or replacement within 24 hours.";
    } else {
        aiResponse = "Welcome to XEVENZO Global! I am your AI staff. How can I help you with your shopping today?";
    }

    res.json({
        success: true,
        ai_staff_reply: aiResponse
    });
});

app.listen(PORT, () => {
    console.log(`XEVENZO Backend Server is running on port ${PORT}`);
});

