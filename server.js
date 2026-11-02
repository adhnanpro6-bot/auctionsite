const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'uploads');
const dbFile = path.join(__dirname, 'pools_db.json');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

if (!fs.existsSync(dbFile)) {
    fs.writeFileSync(dbFile, JSON.stringify({}));
}

// Middleware with high payload limit for card images
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

app.post('/api/action', (req, res) => {
    const { actionType, timestamp } = req.body;
    console.log(`[LOCAL SYSTEM LOG] Action: ${actionType} at ${timestamp}`);
    res.json({ success: true });
});

// API route to get all cards and their pool assignments
app.get('/api/cards', (req, res) => {
    try {
        let dbData = {};
        if (fs.existsSync(dbFile)) {
            dbData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
        }

        if (!fs.existsSync(uploadsDir)) {
            return res.json({ success: true, cards: [] });
        }

        const files = fs.readdirSync(uploadsDir);
        const imageFiles = files.filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file));

        const cardsWithPools = imageFiles.map(filename => ({
            filename: filename,
            pool: dbData[filename] || 'Pool 1'
        }));

        res.json({ success: true, cards: cardsWithPools });
    } catch (err) {
        console.error('Error reading cards:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// API route to save uploaded cards and assign them to a pool locally
app.post('/api/upload-cards', (req, res) => {
    try {
        const { images, poolName } = req.body;
        if (!images || images.length === 0) {
            return res.status(400).json({ success: false, message: 'No images provided.' });
        }

        let dbData = {};
        if (fs.existsSync(dbFile)) {
            dbData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
        }

        const savedFiles = [];
        images.forEach((imgData, index) => {
            const matches = imgData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const ext = matches[1].split('/')[1] || 'png';
                const buffer = Buffer.from(matches[2], 'base64');
                const filename = `card_${Date.now()}_${index + 1}.${ext}`;
                const filepath = path.join(uploadsDir, filename);

                fs.writeFileSync(filepath, buffer);
                savedFiles.push(filename);

                dbData[filename] = poolName || 'Pool 1';
            }
        });

        fs.writeFileSync(dbFile, JSON.stringify(dbData, null, 2));

        console.log(`[LOCAL STORAGE] Saved ${savedFiles.length} card(s) to ${poolName || 'Pool 1'}.`);
        res.json({ success: true, message: `Successfully saved ${savedFiles.length} images to ${poolName || 'Pool 1'}!`, savedFiles });
    } catch (err) {
        console.error('Error saving cards:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// API route to discard/delete a card file and its pool metadata
app.post('/api/discard-card', (req, res) => {
    try {
        const { filename } = req.body;
        if (!filename) {
            return res.status(400).json({ success: false, message: 'No filename provided.' });
        }

        const filePath = path.join(uploadsDir, filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        let dbData = {};
        if (fs.existsSync(dbFile)) {
            dbData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
            delete dbData[filename];
            fs.writeFileSync(dbFile, JSON.stringify(dbData, null, 2));
        }

        console.log(`[LOCAL STORAGE] Discarded card: ${filename}`);
        res.json({ success: true, message: `Card ${filename} permanently discarded.` });
    } catch (err) {
        console.error('Error discarding card:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Futuristic server running at: http://localhost:${PORT}`);
});