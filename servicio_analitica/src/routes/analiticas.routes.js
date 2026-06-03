const { Router } = require('express');
const { testService, testDatabase } = require('../controllers/analiticaController');

const router = Router();

router.get('/test', testService);
router.get('/test-db', testDatabase);

module.exports = router;
