const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
require('dotenv').config();

// 1. INICIALIZAÇÃO DO ORGANISMO
// Tenta pegar a chave do ambiente (Render) ou falha com segurança
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (e) {
  console.error("ERRO CRÍTICO: Chave do Firebase não encontrada nas variáveis de ambiente.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

// Middleware
app.use(cors({ origin: '*' })); 
app.use(express.json());

// Rota de Teste (Para saber se o servidor está vivo)
app.get('/', (req, res) => {
  res.send('Cronosflow Backend: ONLINE');
});

// 2. ROTA DE ATIVAÇÃO DE LICENÇA (O.P. [VALIDAÇÃO-BACKEND])
app.post('/api/ativar-licenca', async (req, res) => {
  const { chave, userId, email } = req.body;

  try {
    // A. Busca a chave
    const docRef = db.collection('licencas_broosaas').doc(chave);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ erro: 'Chave inválida ou inexistente.' });
    }

    const dadosChave = doc.data();

    // B. Verifica integridade
    if (dadosChave.status === 'USADA') {
      return res.status(409).json({ erro: 'Esta chave já foi utilizada.' });
    }

    // C. Transação Atômica
    await db.runTransaction(async (t) => {
      t.update(docRef, {
        status: 'USADA',
        ativadoPor: userId,
        emailVinculado: email,
        dataAtivacao: admin.firestore.FieldValue.serverTimestamp()
      });

      const agendaRef = db.collection('agendas_clientes').doc(userId);
      t.set(agendaRef, {
        email: email,
        plano: dadosChave.tipo || 'padrao',
        statusConta: 'ATIVA',
        criadoEm: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });

    return res.status(200).json({ sucesso: true, mensagem: 'Licença ativada com sucesso.' });

  } catch (error) {
    console.error('Erro no SHP:', error);
    return res.status(500).json({ erro: 'Falha interna na validação.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Cronosflow Backend operando na porta ${PORT}`);
});