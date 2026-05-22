const express = require('express');
const router = express.Router();

// For Node >=18, 'fetch' is globally available. If using Node <18, run: npm install node-fetch
// const fetch = require('node-fetch');

router.get('/', async (req, res) => {
  try {
    const response = await fetch('https://official-joke-api.appspot.com/random_joke');
    if (!response.ok) return res.status(502).json({ error: 'External joke API failure' });
    const joke = await response.json();
    res.json(joke);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

module.exports = router;
