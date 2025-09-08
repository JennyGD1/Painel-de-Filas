document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos do DOM ---
    const filterTypeSelect = document.getElementById('filter-type');
    const groupSelectContainer = document.getElementById('group-selector-container');
    const queueSelectContainer = document.getElementById('queue-selector-container');
    const groupSelect = document.getElementById('select-group');
    const queueSelect = document.getElementById('select-queue');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const generateBtn = document.getElementById('generate-report-btn');
    const errorMessageElement = document.getElementById('error-message');

    // --- Instâncias dos Gráficos ---
    let volumeChartInstance = null;
    let slaChartInstance = null;

    // --- Definição de Metas (Exemplo ISSEC) ---
    const metasCliente = {
        // ID do Grupo ISSEC (conforme seu array gruposDeFila) é 52
        "52": {
            atendidasPercentMeta: 97.5,
            abandonoPercentMeta: 2.5,
            tmeMeta: 120, // 02:00 em segundos
            tmaMeta: 480, // 08:00 em segundos
            slaMeta: 80, // SLA de Espera (00:30)
            slaTimeThreshold: 30 // Limite de tempo em segundos para o SLA
        }
        // Adicione outras metas aqui...
        // "48": { ... metas SC Saúde ... } 
    };

    // --- INICIALIZAÇÃO DA PÁGINA ---
    loadFilterOptions();
    setupEventListeners();

    // --- Carrega opções dos seletores de Grupo e Fila ---
    async function loadFilterOptions() {
        try {
            // No futuro, podemos criar uma rota /api/queues para buscar filas reais da Evolux
            // Por enquanto, usamos os dados de gruposDeFila do backend.
            const response = await fetch('/api/filters-options'); 
            const data = await response.json();

            populateSelect(groupSelect, data.groups);
            populateSelect(queueSelect, data.queues); // Fila individual (simplificado)

        } catch (error) {
            console.error('Erro ao carregar filtros:', error);
            errorMessageElement.textContent = 'Erro ao carregar filtros.';
        }
    }

    function populateSelect(selectElement, items) {
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            selectElement.appendChild(option);
        });
    }

    // --- Configuração dos Event Listeners ---
    function setupEventListeners() {
        // Alterna a visibilidade dos seletores de grupo/fila
        filterTypeSelect.addEventListener('change', () => {
            if (filterTypeSelect.value === 'group') {
                groupSelectContainer.style.display = 'block';
                queueSelectContainer.style.display = 'none';
            } else {
                groupSelectContainer.style.display = 'none';
                queueSelectContainer.style.display = 'block';
            }
        });

        // Listener do botão principal de gerar relatório
        generateBtn.addEventListener('click', handleGenerateReport);
    }

    // --- Validação e Geração do Relatório ---
    async function handleGenerateReport() {
        errorMessageElement.textContent = ''; // Limpa erros antigos

        if (!validateInputs()) return;

        const filterType = filterTypeSelect.value;
        const filterValue = (filterType === 'group') ? groupSelect.value : queueSelect.value;
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        try {
            const queryParams = new URLSearchParams({ startDate, endDate, filterType, filterValue });
            const response = await fetch(`/api/reports/sla?${queryParams}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Erro ${response.status}`);
            }

            const result = await response.json();
            processAndRenderData(result);

        } catch (error) {
            console.error('Erro ao gerar relatório:', error);
            errorMessageElement.textContent = `Falha ao buscar dados: ${error.message}`;
        }
    }

    function validateInputs() {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        if (!startDate || !endDate) {
            errorMessageElement.textContent = 'Data inicial e data final são obrigatórias.';
            return false;
        }

        const date1 = new Date(startDate);
        const date2 = new Date(endDate);
        const diffTime = Math.abs(date2 - date1);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 31) {
            errorMessageElement.textContent = 'Período máximo de 31 dias excedido.';
            return false;
        }
        return true;
    }

    // --- Processamento e Renderização dos Dados ---
    function processAndRenderData(result) {
        const dailyData = result.data.filter(entry => entry.label !== 'Total');
        const summaryData = result.data.find(entry => entry.label === 'Total');
        
        // Determina a meta aplicável baseada no filtro selecionado
        const currentGoals = metasCliente[result.requestInfo.filterValue] || {};

        // 1. Processar dados para os gráficos de evolução diária
        const labels = dailyData.map(entry => entry.label);
        const receivedCalls = dailyData.map(entry => entry.calls);
        const answeredCalls = dailyData.map(entry => entry.answered);
        const abandonedCalls = dailyData.map(entry => entry.abandoned);
        const slaPercent = dailyData.map(entry => entry.in_sla_wait_percent); // Métrica de SLA da API

        // 2. Renderizar gráficos
        renderVolumeChart(labels, receivedCalls, answeredCalls, abandonedCalls);
        renderSlaChart(labels, slaPercent, currentGoals);

        // 3. Atualizar KPIs com dados totais do período
        if (summaryData) {
            updateKpiCards(summaryData, currentGoals);
        }
    }
    
    function updateKpiCards(summary, goals) {
        // Formatar e exibir TMA e TME
        document.getElementById('kpi-tma').textContent = formatTime(summary.att);
        document.getElementById('kpi-tme').textContent = formatTime(summary.asa);
        if(goals.tmaMeta) document.getElementById('kpi-meta-tma').textContent = `Meta: ${formatTime(goals.tmaMeta)}`;
        if(goals.tmeMeta) document.getElementById('kpi-meta-tme').textContent = `Meta: ${formatTime(goals.tmeMeta)}`;

        // Formatar e exibir SLA e Abandono
        document.getElementById('kpi-sla').textContent = `${summary.in_sla_wait_percent.toFixed(2)}%`;
        document.getElementById('kpi-abandonment').textContent = `${summary.abandoned_percent.toFixed(2)}%`;
        if(goals.slaMeta) document.getElementById('kpi-meta-sla').textContent = `Meta: ${goals.slaMeta.toFixed(2)}%`;
        if(goals.abandonoPercentMeta) document.getElementById('kpi-meta-abandonment').textContent = `Meta: < ${goals.abandonoPercentMeta.toFixed(2)}%`;
    }

    // --- Funções de Renderização de Gráficos ---
    function renderVolumeChart(labels, received, answered, abandoned) {
        const ctx = document.getElementById('volumeChart').getContext('2d');
        if (volumeChartInstance) volumeChartInstance.destroy();

        volumeChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Recebidas',
                        data: received,
                        backgroundColor: '#a9c_f_e', // Cinza azulado
                    },
                    {
                        label: 'Atendidas',
                        data: answered,
                        backgroundColor: '#224aa2', // Azul Maida
                    },
                    {
                        label: 'Abandonadas',
                        data: abandoned,
                        backgroundColor: '#ff6b8b', // Rosa Maida
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: { title: { display: true, text: 'Volume de Chamadas (Recebidas x Atendidas x Abandonadas)' } },
                scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
            }
        });
    }

    function renderSlaChart(labels, slaPercent, goals) {
        const ctx = document.getElementById('slaChart').getContext('2d');
        if (slaChartInstance) slaChartInstance.destroy();

        const datasets = [{
            label: '% Nível de Serviço (SLA)',
            data: slaPercent,
            borderColor: '#224aa2',
            fill: false,
            tension: 0.1
        }];

        // Adiciona a linha de meta se existir para o cliente selecionado
        if (goals.slaMeta) {
            datasets.push({
                label: `Meta SLA (${goals.slaMeta}%)`,
                data: Array(labels.length).fill(goals.slaMeta),
                borderColor: '#e0526e',
                borderDash: [5, 5], // Linha tracejada
                fill: false,
                pointRadius: 0
            });
        }

        slaChartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                plugins: { title: { display: true, text: 'Performance do Nível de Serviço vs Meta' } },
                scales: { y: { beginAtZero: true, max: 100, ticks: { callback: value => value + '%' } } }
            }
        });
    }
    
    // Função utilitária para formatar segundos em MM:SS
    function formatTime(totalSeconds) {
        if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
});