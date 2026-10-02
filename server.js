const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>XEVENZO Store</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 15px; margin: 0;">
                <h1 style="color: #333; text-align: center; font-size: 22px;">XEVENZO Global Store</h1>
                <div style="background: white; padding: 15px; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #333;">AI Dynamic Pricing Product</h3>
                    <p style="color: #007bff; font-weight: bold; margin: 0;">Price: $24.99</p>
                    <p style="color: #666; font-size: 14px;">Status: Connected Successfully to Cloud Backend</p>
                </div>
            </body>
        </html>
    `);
});

app.get('/api/products', (req, res) => {
    res.json({
        success: true,
        data: [
            {
                id: 1,
                title: "XEVENZO AI Smart Product",
                original_price: 20.00,
                xevenzo_price: 24.99,
                image: "https://via.placeholder.com/150"
            }
        ]
    });
});

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
