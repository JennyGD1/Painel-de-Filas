
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURAÇÕES E CACHE ---
const EVOLUX_API_TOKEN = '53503b37-039a-4b18-9fbc-e925f7c71521';
const EVOLUX_REALTIME_URL = 'https://maida.evolux.io/api/realtime/v1/queue';
const EVOLUX_REPORTS_URL = 'https://maida.evolux.io/api/v1/report/answered_abandoned_sla';
const EVOLUX_CALLS_REPORT_URL = 'https://maida.evolux.io/api/v1/report/calls_history';

// CACHES SEPARADOS
const realtimeCache = new NodeCache({ stdTTL: 5, checkperiod: 7 });
const lastCallsCache = new NodeCache({ stdTTL: 10, checkperiod: 15 });
const tmaTmeCache = new NodeCache({ stdTTL: 40, checkperiod: 50 });            // Cache de 30 segundos
const abandonoDiaCache = new NodeCache({ stdTTL: 60, checkperiod: 70 });   // Cache de 1 minuto
const variationCache = new NodeCache({ stdTTL: 300, checkperiod: 310 });       // Cache de 5 MINUTOS
const reportsCache = new NodeCache({ stdTTL: 600, checkperiod: 610 });

const gruposDeFila = [
    { name: "ISSEC", groupId: 52, queueIds: [514, 515] },
    { name: "Plano de ação PLANSERV", groupId: 40, queueIds: [371, 250, 248, 249, 155, 157, 158, 325, 251, 276, 417] },
    { name: "Planserv - Beneficiários", groupId: 34, queueIds: [248, 249, 276, 155, 251, 325, 157, 158, 274, 417] },
    { name: "Planserv - Central de atendimento", groupId: 18, queueIds: [18, 157, 713, 325, 158, 274, 709, 714, 248, 249, 250, 251, 253, 256, 257, 258, 371, 417] },
    { name: "Planserv geral", groupId: 25, queueIds: [25, 362, 367, 371, 275, 325, 155, 250, 257, 258, 157, 248, 249, 253, 254, 256, 274, 158, 276, 710, 713, 712, 714] },
    { name: "PLANSERV IR", groupId: 36, queueIds: [36, 155] },
    { name: "Planserv - Ouvidoria", groupId: 23, queueIds: [23, 252, 158] },
    { name: "Planserv - Prestador", groupId: 35, queueIds: [35, 371, 250, 253, 254, 256, 257, 258, 712, 714, 709, 713, 710] },
    { name: "Planserv - Remoções", groupId: 22, queueIds: [22, 274, 256] },
    { name: "Sassepe - Central de Atendimento", groupId: 54, queueIds: [54, 357, 521, 522] },
    { name: "Senado", groupId: 55, queueIds: [55, 528] },
    { name: "INAS GDF SAÚDE", groupId: 41, queueIds: [41, 24, 25, 29, 31, 34, 35] },
    { name: "SC SAÚDE - Central de atendimento", groupId: 48, queueIds: [48, 470, 471] }
];

app.use(cors());
app.use(express.static('public'));

// 1. Rota para carregar os filtros no frontend (adicione esta nova rota)
//    Pega a lista de grupos do seu array 'gruposDeFila' existente.
// 1. Rota para carregar os filtros no frontend (adicione esta nova rota)
//    Pega a lista de grupos do seu array 'gruposDeFila' existente.
app.get('/api/filters-options', (req, res) => {
    try {
        const groups = gruposDeFila.map(g => ({ id: g.groupId, name: g.name }));
        
        // Extrai todas as filas únicas (simulação, idealmente viria da API)
        const allQueuesMap = new Map();
        gruposDeFila.forEach(grupo => {
            grupo.queueIds.forEach(id => {
                // Em um cenário real, precisaríamos buscar o nome da fila correspondente ao ID.
                // Por enquanto, vamos criar nomes fictícios baseados no ID.
                if (!allQueuesMap.has(id)) {
                    allQueuesMap.set(id, { id: id, name: `Fila ID ${id}` }); 
                }
            });
        });
        const queues = Array.from(allQueuesMap.values());

        res.json({ groups, queues });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao carregar opções de filtro' });
    }
});


// 2. Modifique a rota /api/reports/sla existente para aceitar os novos filtros
app.get('/api/reports/sla', async (req, res) => {
    const { startDate, endDate, filterType, filterValue } = req.query;

    if (!startDate || !endDate || !filterType || !filterValue) {
        return res.status(400).json({ error: 'Todos os filtros são obrigatórios.' });
    }
    
    const cacheKey = `report_sla_${filterType}_${filterValue}_${startDate}_${endDate}`;
    if (reportsCache.has(cacheKey)) {
        return res.json(reportsCache.get(cacheKey));
    }

    const isoStartDate = `${startDate}T03:00:00.000Z`;
    const tempEndDate = new Date(endDate);
    tempEndDate.setDate(tempEndDate.getDate() + 1);
    const isoEndDate = `${tempEndDate.toISOString().split('T')[0]}T02:59:59.999Z`;

    const reportParams = {
        start_date: isoStartDate,
        end_date: isoEndDate,
        group_by: 'day',
        start_hour: '07',
        end_hour: '19'
    };

    // Lógica dinâmica de filtro
    if (filterType === 'group') {
        reportParams.entity = 'queue_groups';
        reportParams.queue_group_ids = filterValue;
    } else { // filterType === 'queue'
        reportParams.entity = 'queues';
        reportParams.queues_ids = filterValue;
        reportParams.queue_or_group = 'queues'; // Necessário quando entity é queues
    }

    try {
        const headers = { 'token': EVOLUX_API_TOKEN, 'User-Agent': 'Mozilla/5.0' };
        const response = await axios.get(EVOLUX_REPORTS_URL, { headers, params: reportParams });
        
        // Anexa as informações de filtro e metas aos dados (simulação de metas)
        const responseData = response.data;
        responseData.requestInfo = { filterType, filterValue }; // Guarda o que foi solicitado

        reportsCache.set(cacheKey, responseData);
        res.json(responseData);

    } catch (error) {
        if (error.response) {
            console.error('Erro detalhado da API de Relatório SLA:', JSON.stringify(error.response.data, null, 2));
            res.status(error.response.status).json(error.response.data);
        } else {
            console.error('Erro ao conectar com a API de Relatório SLA:', error.message);
            res.status(500).json({ error: 'Falha ao conectar com o servidor' });
        }
    }
});

app.get('/api/filas', async (req, res) => {
    const cacheKey = 'dados_em_tempo_real';
    if (realtimeCache.has(cacheKey)) {
        return res.json({ dados: realtimeCache.get(cacheKey) });
    }
    try {
        const headers = { 'token': EVOLUX_API_TOKEN, 'User-Agent': 'Mozilla/5.0' };
        const response = await axios.get(EVOLUX_REALTIME_URL, { headers });
        const data = response.data.data || {};
        data.server_time = new Date().toISOString();
        realtimeCache.set(cacheKey, data);
        res.json({ dados: data });
    } catch (error) {
        console.error(`Erro na API Realtime:`, error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Falha ao buscar dados em tempo real' });
    }
});

app.get('/api/ultimas-chamadas', async (req, res) => {
    const nomeDoGrupo = req.query.grupo;
    const grupo = gruposDeFila.find(g => g.name === nomeDoGrupo);
    if (!grupo) return res.status(400).json({ error: 'Grupo não encontrado' });
    const cacheKey = `ultimas_chamadas_${grupo.groupId}`;
    if (lastCallsCache.has(cacheKey)) {
        return res.json(lastCallsCache.get(cacheKey));
    }
    try {
        const headers = { 'token': EVOLUX_API_TOKEN, 'User-Agent': 'Mozilla/5.0' };
        const agora = new Date();
        const start_date = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0).toISOString();
        const end_date = agora.toISOString();
        const reportParams = { start_date, end_date, entity: 'queue_groups', queue_group_ids: grupo.groupId, limit: 500 };
        const reportResponse = await axios.get(EVOLUX_CALLS_REPORT_URL, { headers, params: reportParams });
        const calls = reportResponse.data.data.calls || [];
        const lastCalls = {};
        for (const call of calls) {
            if (call.agent_id && call.time_leave) {
                const callEndTime = new Date(call.time_leave).getTime();
                if (!lastCalls[call.agent_id] || callEndTime > lastCalls[call.agent_id]) {
                    lastCalls[call.agent_id] = callEndTime;
                }
            }
        }
        lastCallsCache.set(cacheKey, lastCalls);
        res.json(lastCalls);
    } catch (error) {
        console.error(`Erro na API de Relatório de Chamadas:`, error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Falha ao buscar relatório de chamadas' });
    }
});

// NOVA ROTA 1: Para TMA e TME - CACHE DE 1 MINUTO
app.get('/api/indicadores/tma-tme', async (req, res) => {
    const nomeDoGrupo = req.query.grupo;
    const grupo = gruposDeFila.find(g => g.name === nomeDoGrupo);
    if (!grupo) return res.status(400).json({ error: 'Grupo não encontrado' });

    const cacheKey = `tma_tme_${grupo.groupId}`;
    if (tmaTmeCache.has(cacheKey)) {
        return res.json(tmaTmeCache.get(cacheKey));
    }
    // Substitua o bloco try...catch existente por este:
    try {
        const headers = { 'token': EVOLUX_API_TOKEN, 'User-Agent': 'Mozilla/5.0' };

        // --- LÓGICA DE DATA FORÇANDO O FUSO HORÁRIO UTC-3 ---
        // Pega a data e hora atual em UTC
        const agoraUTC = new Date();
        
        // Pega o ano, mês e dia com base na data de Fortaleza (subtraindo 3 horas do UTC)
        const agoraFortaleza = new Date(agoraUTC.getTime() - (3 * 60 * 60 * 1000));
        const year = agoraFortaleza.getUTCFullYear();
        const month = agoraFortaleza.getUTCMonth();
        const day = agoraFortaleza.getUTCDate();

        // Define o início do dia como meia-noite de Fortaleza, mas no formato UTC (03:00 UTC)
        // A API da Evolux sempre espera o formato UTC (com 'Z' no final)
        const inicioDoDiaUTC = new Date(Date.UTC(year, month, day, 3, 0, 0));
        
        const params = {
            start_date: inicioDoDiaUTC.toISOString(),
            end_date: agoraUTC.toISOString(),
            entity: 'queue_groups',
            queue_group_ids: grupo.groupId,
            group_by: 'day'
        };
        // --- FIM DA LÓGICA DE DATA ---

        const response = await axios.get(EVOLUX_REPORTS_URL, { headers, params });
        const totais = response.data.data.find(item => item.label === 'Total');
        const resultado = {
            tma: totais ? totais.att || 0 : 0,
            tme: totais ? totais.asa || 0 : 0,
        };
        tmaTmeCache.set(cacheKey, resultado);
        res.json(resultado);

    } catch (error) {
        console.error(`Erro na API de TMA/TME:`, error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Falha ao buscar TMA/TME' });
    }
});

// NOVA ROTA 2: Para % Abandono (DIA) - CACHE DE 1 HORA
app.get('/api/indicadores/abandono-dia', async (req, res) => {
    const nomeDoGrupo = req.query.grupo;
    const grupo = gruposDeFila.find(g => g.name === nomeDoGrupo);
    if (!grupo) return res.status(400).json({ error: 'Grupo não encontrado' });

    const cacheKey = `abandono_dia_${grupo.groupId}`;
    if (abandonoDiaCache.has(cacheKey)) {
        return res.json(abandonoDiaCache.get(cacheKey));
    }
    try {
        const headers = { 'token': EVOLUX_API_TOKEN, 'User-Agent': 'Mozilla/5.0' };
        const agoraUTC = new Date();
        const agoraFortaleza = new Date(agoraUTC.getTime() - (3 * 60 * 60 * 1000));
        const year = agoraFortaleza.getUTCFullYear();
        const month = agoraFortaleza.getUTCMonth();
        const day = agoraFortaleza.getUTCDate();
        const inicioDoDiaUTC = new Date(Date.UTC(year, month, day, 3, 0, 0));
        
        const params = {
            start_date: inicioDoDiaUTC.toISOString(),
            end_date: agoraUTC.toISOString(),
            entity: 'queue_groups',
            queue_group_ids: grupo.groupId,
            group_by: 'day',
            start_hour: '07', 
            end_hour: '19'    
        };
        
        const response = await axios.get(EVOLUX_REPORTS_URL, { headers, params });
        const totais = response.data.data.find(item => item.label === 'Total');
        const resultado = {
            abandono_dia_acumulado: totais ? (totais.abandoned_percent || 0) : 0,
        };
        abandonoDiaCache.set(cacheKey, resultado);
        res.json(resultado);
    } catch (error) {
        console.error(`Erro na API de Abandono Dia:`, error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Falha ao buscar abandono do dia' });
    }
});

// ROTA 3: Para a variação do abandono - CACHE DE 5 MINUTOS (sem alteração)
app.get('/api/indicadores/variacao', async (req, res) => {
    const nomeDoGrupo = req.query.grupo;
    const grupo = gruposDeFila.find(g => g.name === nomeDoGrupo);
    if (!grupo) return res.status(400).json({ error: 'Grupo não encontrado' });

    const cacheKey = `indicadores_variacao_${grupo.groupId}`;
    if (variationCache.has(cacheKey)) {
        return res.json(variationCache.get(cacheKey));
    }
    try {
        const headers = { 'token': EVOLUX_API_TOKEN, 'User-Agent': 'Mozilla/5.0' };
        const getRate = async (start, end) => {
            const params = {
                start_date: start,
                end_date: end,
                entity: 'queue_groups',
                queue_group_ids: grupo.groupId,
                group_by: 'day',
                start_hour: '07',
                end_hour: '19'
            };
            const response = await axios.get(EVOLUX_REPORTS_URL, { headers, params });
            const totais = response.data.data.find(item => item.label === 'Total');
            return totais ? (totais.abandoned_percent || 0) : 0;
        };
        
        // Pega a data/hora atual em UTC e define o início do dia em UTC-3
        const agoraUTC = new Date();
        const agoraFortaleza = new Date(agoraUTC.getTime() - (3 * 60 * 60 * 1000));
        const year = agoraFortaleza.getUTCFullYear();
        const month = agoraFortaleza.getUTCMonth();
        const day = agoraFortaleza.getUTCDate();
        const inicioDoDiaUTC = new Date(Date.UTC(year, month, day, 3, 0, 0));
        
        // Em vez de "início da hora", calculamos "exatamente uma hora atrás"
        const umaHoraAtrasUTC = new Date(agoraUTC.getTime() - (1 * 60 * 60 * 1000));

        // Calcula a taxa de abandono acumulada até agora
        const taxaDiaAcumulado = await getRate(inicioDoDiaUTC.toISOString(), agoraUTC.toISOString());
        
        // Calcula a taxa de abandono acumulada até UMA HORA ATRÁS
        const taxaUmaHoraAtras = await getRate(inicioDoDiaUTC.toISOString(), umaHoraAtrasUTC.toISOString());
        
        const resultado = {
            abandono_dia_acumulado: taxaDiaAcumulado,
            // O frontend usará este valor como o ponto de referência anterior
            abandono_inicio_hora: taxaUmaHoraAtras 
        };

        variationCache.set(cacheKey, resultado);
        res.json(resultado);
    } catch (error) {
        console.error(`Erro na API de Variação de Indicadores:`, error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Falha ao buscar variação de indicadores' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor com cache rodando em http://localhost:${PORT}`);
});