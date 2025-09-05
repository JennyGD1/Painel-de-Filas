// server.js - (Indicadores por Grupo)
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const PORT = 3000;

// --- CONFIGURAÇÕES ---
const EVOLUX_API_TOKEN = '53503b37-039a-4b18-9fbc-e925f7c71521';
const EVOLUX_REALTIME_URL = 'https://maida.evolux.io/api/realtime/v1/queue';
const EVOLUX_REPORTS_URL = 'https://maida.evolux.io/api/v1/report/answered_abandoned_sla';

const gruposDeFila = [
    { name: "ISSEC", groupId: 52 },
    { name: "Plano de ação PLANSERV", groupId: 40 },
    { name: "Planserv - Beneficiários", groupId: 34 },
    { name: "Planserv - Central de atendimento", groupId: 18 },
    { name: "Planserv geral", groupId: 25 },
    { name: "PLANSERV IR", groupId: 36 },
    { name: "Planserv - Ouvidoria", groupId: 23 },
    { name: "Planserv - Prestador", groupId: 35 },
    { name: "Planserv - Remoções", groupId: 22 },
    { name: "Sassepe - Central de Atendimento", groupId: 54 },
    { name: "SC SAÚDE - Central de atendimento", groupId: 48 }
];

app.use(cors());
app.use(express.static('public'));


app.get('/api/filas', async (req, res) => {
    const nomeDoGrupo = req.query.grupo;
    const grupo = gruposDeFila.find(g => g.name === nomeDoGrupo);
    if (!grupo) return res.status(400).json({ error: 'Grupo não encontrado' });
    try {
        const headers = { 
            'token': EVOLUX_API_TOKEN,
            'User-Agent': 'Mozilla/5.0'
        };
        const params = { group_id: grupo.groupId };
        const response = await axios.get(EVOLUX_REALTIME_URL, { headers, params });
        res.json({ dados: response.data.data || {} });
    } catch (error) {
        console.error(`Erro na API Realtime:`, error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Falha ao buscar dados em tempo real' });
    }
});

app.get('/api/indicadores', async (req, res) => {
    const nomeDoGrupo = req.query.grupo;
    const grupo = gruposDeFila.find(g => g.name === nomeDoGrupo);
    if (!grupo) return res.status(400).json({ error: 'Grupo não encontrado' });

    const hoje = new Date();
    const start_date = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(), 3, 0, 0)).toISOString();
    const end_date = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + 1, 2, 59, 59, 999)).toISOString();
    
    console.log(`🔄 Buscando indicadores para o grupo: ${grupo.name} (ID: ${grupo.groupId})`);
    
    try {
        const headers = { 'token': EVOLUX_API_TOKEN, 'User-Agent': 'Mozilla/5.0' };
        
        const params = {
            start_date,
            end_date,
            entity: 'queue_groups',
            queue_or_group: 'queue_groups',
            queue_group_ids: grupo.groupId, // Usando o ID do GRUPO
            group_by: 'day',
            start_hour: '07',
            end_hour: '19'
        };

        const response = await axios.get(EVOLUX_REPORTS_URL, { headers, params });
        const totais = response.data.data.find(item => item.label === 'Total');

        if (totais) {
            const result = {
                tma: totais.att || 0,
                tme: totais.asa || 0,
                answered_rate: totais.answered_percent || 0
            };
            console.log(`✅ Indicadores para '${grupo.name}' recebidos:`, result);
            res.json(result);
        } else {
            console.log(`⚠️ Relatório recebido, mas sem a linha de "Total" para o grupo ${grupo.name}.`);
            res.json({ tma: 0, tme: 0, answered_rate: 0 });
        }
    } catch (error) {
        console.error(`Erro na API de Relatórios:`, error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Falha ao buscar indicadores' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});