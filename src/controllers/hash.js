const bcrypt = require('bcrypt');

async function generar() {
    const psw = '12345678a';
    const hash = await bcrypt.hash(psw, 10);
    console.log('--- COPIA ESTE HASH ---');
    console.log(hash);
    console.log('-----------------------');
}

generar();