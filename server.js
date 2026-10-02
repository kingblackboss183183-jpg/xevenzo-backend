const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', async (req, res) => {
    try {
        const response = await axios.get('https://fakestoreapi.com/products?limit=5');
        const products = response.data;
        
        let productsHtml = products.map(p => `
            <div style="background: white; padding: 15px; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <img src="${p.image}" style="width: 80px; height: 80px; object-fit: contain; float: left; margin-right: 15px;" />
                <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #333;">${p.title}</h3>
                <p style="color: #007bff; font-weight: bold; margin: 0;">Price: $${(p.price * 1.2).toFixed(2)}</p>
                <div style="clear: both;"></div>
            </div>
        `).join('');

        res.send(`
            <html>
                <head>
                    <title>XEVENZO Store</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 15px; margin: 0;">
                    <h1 style="color: #333; text-align: center; font-size: 22px;">XEVENZO Global Store</h1>
                    ${productsHtml}
                </body>
            </html>
        `);
    } catch (error) {
        res.send('<html><body style="padding:20px; font-family:Arial;"><h3>Loading Products... Please refresh.</h3></body></html>');
    }
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
