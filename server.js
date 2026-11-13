const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const CARDS_FILE = path.join(__dirname, 'cards.json');
const TEAMS_FILE = path.join(__dirname, 'teams.json');

// Ensure required directories and files exist safely
if (!fs.existsSync(UPLOADS_DIR)) {
    try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) {}
}

function getStoredCards() {
    try {
        if (fs.existsSync(CARDS_FILE)) {
            return JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
        }
    } catch (e) { console.error("Error reading cards.json:", e); }
    return [];
}

function saveStoredCards(cards) {
    try {
        fs.writeFileSync(CARDS_FILE, JSON.stringify(cards, null, 2));
    } catch (e) { console.error("Error writing cards.json:", e); }
}

function getStoredTeams() {
    try {
        if (fs.existsSync(TEAMS_FILE)) {
            return JSON.parse(fs.readFileSync(TEAMS_FILE, 'utf8'));
        }
    } catch (e) { console.error("Error reading teams.json:", e); }
    return {};
}

function saveStoredTeams(teams) {
    try {
        fs.writeFileSync(TEAMS_FILE, JSON.stringify(teams, null, 2));
    } catch (e) { console.error("Error writing teams.json:", e); }
}

// 1. Get all uploaded cards
app.get('/api/cards', (req, res) => {
    const cardsData = getStoredCards();
    res.json({ success: true, cards: cardsData });
});

// 2. Upload new cards and assign to a Pool
app.post('/api/upload-cards', (req, res) => {
    try {
        const { images, poolName } = req.body;
        if (!images || !Array.isArray(images) || images.length === 0) {
            return res.status(400).json({ success: false, message: 'No images provided.' });
        }

        let cardsData = getStoredCards();

        images.forEach((imgBase64, index) => {
            const matches = imgBase64.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) return;

            const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
            const buffer = Buffer.from(matches[2], 'base64');
            const filename = `card_${Date.now()}_${index}.${ext}`;
            const filepath = path.join(UPLOADS_DIR, filename);

            fs.writeFileSync(filepath, buffer);

            cardsData.push({
                filename: filename,
                pool: poolName || 'Pool 1',
                uploadedAt: new Date().toISOString()
            });
        });

        saveStoredCards(cardsData);
        res.json({ success: true, message: `${images.length} cards successfully saved to system!` });
    } catch (err) {
        console.error('Error uploading cards:', err);
        res.status(500).json({ success: false, message: 'Server error during upload.' });
    }
});

// 3. Discard / Remove card permanently from system
app.post('/api/discard-card', (req, res) => {
    try {
        const { filename } = req.body;
        if (!filename) {
            return res.status(400).json({ success: false, message: 'Filename required.' });
        }

        const filePath = path.join(UPLOADS_DIR, filename);
        if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
        }

        let cardsData = getStoredCards();
        cardsData = cardsData.filter(c => c.filename !== filename);
        saveStoredCards(cardsData);

        res.json({ success: true, message: `Card ${filename} successfully discarded.` });
    } catch (err) {
        console.error('Error discarding card:', err);
        res.status(500).json({ success: false, message: 'Failed to discard card.' });
    }
});

// 4. Get all team details and rosters with balances
app.get('/api/teams', (req, res) => {
    let teamsData = getStoredTeams();
    
    Object.keys(teamsData).forEach(tName => {
        if (Array.isArray(teamsData[tName])) {
            teamsData[tName] = {
                balance: 10000000, 
                roster: teamsData[tName]
            };
        }
    });

    res.json({ success: true, teams: teamsData });
});

// 5. Create a new team with starting balance
app.post('/api/teams/create', (req, res) => {
    try {
        const { teamName, balance } = req.body;
        if (!teamName) {
            return res.status(400).json({ success: false, message: 'Team name is required.' });
        }

        let teamsData = getStoredTeams();

        if (teamsData[teamName]) {
            return res.status(400).json({ success: false, message: 'Team already exists.' });
        }

        teamsData[teamName] = {
            balance: Number(balance) || 0,
            roster: []
        };

        saveStoredTeams(teamsData);
        res.json({ success: true, teams: teamsData });
    } catch (err) {
        console.error('Error creating team:', err);
        res.status(500).json({ success: false, message: 'Failed to create team.' });
    }
});

// 6. Delete a team
app.post('/api/teams/delete', (req, res) => {
    try {
        const { teamName } = req.body;
        let teamsData = getStoredTeams();

        if (teamsData[teamName]) {
            delete teamsData[teamName];
            saveStoredTeams(teamsData);
        }
        res.json({ success: true, teams: teamsData });
    } catch (err) {
        console.error('Error deleting team:', err);
        res.status(500).json({ success: false, message: 'Failed to delete team.' });
    }
});

// 7. Assign sold player to a team, record price, and deduct from balance
app.post('/api/save-team-card', (req, res) => {
    try {
        const { teamName, filename, price } = req.body;
        if (!teamName || !filename) {
            return res.status(400).json({ success: false, message: 'Team name and filename are required.' });
        }

        let teamsData = getStoredTeams();

        if (!teamsData[teamName]) {
            teamsData[teamName] = { balance: 10000000, roster: [] };
        } else if (Array.isArray(teamsData[teamName])) {
            teamsData[teamName] = { balance: 10000000, roster: teamsData[teamName] };
        }

        const salePrice = Number(price) || 0;
        teamsData[teamName].balance = Math.max(0, teamsData[teamName].balance - salePrice);

        teamsData[teamName].roster.push({
            filename: filename,
            price: salePrice.toString()
        });

        saveStoredTeams(teamsData);
        res.json({ success: true, teams: teamsData });
    } catch (err) {
        console.error('Error saving team card:', err);
        res.status(500).json({ success: false, message: 'Failed to assign card to team.' });
    }
});

// 8. Action logger endpoint
app.post('/api/action', (req, res) => {
    const { actionType, timestamp } = req.body;
    console.log(`[Terminal Action]: ${actionType} at ${timestamp}`);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`🚀 Futuristic Auction Terminal running on port ${PORT}`);
});
