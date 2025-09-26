
// Risk calculation weights
const riskWeights = {
    unauthorized_acc_yes: 1,
    unauthorized_acc_no: 0,
    unauthorized_chg_yes: 1,
    unauthorized_chg_no: 0,
    unaudited_chg_yes: 1,
    unaudited_chg_no: 0,
    perm_dos_yes: 1,
    perm_dos_no: 0,
    no_authentication_yes: 1,
    no_authentication_no: 0,
    privileged_acc_yes: 0,
    privileged_acc_no: 1,
    remote_attack_yes: 1,
    remote_attack_no: 0,
    exploit_code_yes: 1,
    exploit_code_no: 0,
    special_cond_yes: 0,
    special_cond_no: 1,
    other_components_yes: 0,
    other_components_no: 1
};

// Risk level configuration
const riskLevels = {
    low: { min: 0, max: 3, color: 'low', icon: 'fas fa-shield-check' },
    medium: { min: 4, max: 5, color: 'medium', icon: 'fas fa-shield-exclamation' },
    high: { min: 6, max: 7, color: 'high', icon: 'fas fa-shield-virus' },
    critical: { min: 8, max: 10, color: 'critical', icon: 'fas fa-shield-slash' }
};

document.addEventListener('DOMContentLoaded', function () {
    hideTotal();
    addFormEnhancements();
});

function addFormEnhancements() {
    const form = document.getElementById('riskform');
    if (form) {
        form.addEventListener('change', function (e) {
            if (e.target.type === 'radio') {
                setTimeout(() => {
                    calculateTotal();
                }, 150);
            }
        });
    }

    const radioOptions = document.querySelectorAll('.radio-option');
    radioOptions.forEach(option => {
        option.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const radio = this.querySelector('input[type="radio"]');
                if (radio) {
                    radio.checked = true;
                    calculateTotal();
                }
            }
        });
    });

    addProgressIndicator();
}

function addProgressIndicator() {
    const questionsSection = document.querySelector('.questions-section');
    if (questionsSection) {
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';
        progressContainer.innerHTML = `
            <div class="progress-header">
                <span class="progress-text">Progress: <span id="progress-count">0</span>/10 questions answered</span>
                <div class="progress-bar">
                    <div class="progress-fill" id="progress-fill"></div>
                </div>
            </div>
        `;

        questionsSection.insertBefore(progressContainer, questionsSection.firstChild);
        if (!document.querySelector('#progress-styles')) {
            const style = document.createElement('style');
            style.id = 'progress-styles';
            style.textContent = `
                .progress-container {
                    margin-bottom: 2rem;
                    padding: 1.5rem;
                    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
                    border-radius: 0.75rem;
                    border: 1px solid #cbd5e1;
                }
                .progress-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 1rem;
                    flex-wrap: wrap;
                }
                .progress-text {
                    font-size: 0.875rem;
                    color: #475569;
                    font-weight: 500;
                }
                .progress-bar {
                    flex: 1;
                    max-width: 200px;
                    height: 8px;
                    background: #e2e8f0;
                    border-radius: 4px;
                    overflow: hidden;
                }
                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #2563eb, #3b82f6);
                    width: 0%;
                    transition: width 0.3s ease;
                    border-radius: 4px;
                }
                @media (max-width: 640px) {
                    .progress-header {
                        flex-direction: column;
                        align-items: stretch;
                    }
                    .progress-bar {
                        max-width: none;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }
}

function updateProgress() {
    const form = document.forms["riskform"];
    const questionNames = [
        'unauthorized_acc', 'unauthorized_chg', 'unaudited_chg', 'perm_dos',
        'no_authentication', 'privileged_acc', 'remote_attack', 'exploit_code',
        'special_cond', 'other_components'
    ];

    let answeredCount = 0;
    questionNames.forEach(name => {
        const checkedRadio = form.querySelector(`input[name="${name}"]:checked`);
        if (checkedRadio) {
            answeredCount++;
        }
    });

    const progressCount = document.getElementById('progress-count');
    const progressFill = document.getElementById('progress-fill');

    if (progressCount) {
        progressCount.textContent = answeredCount;
    }

    if (progressFill) {
        const percentage = (answeredCount / questionNames.length) * 100;
        progressFill.style.width = `${percentage}%`;
    }

    return answeredCount === questionNames.length;
}

function calculateTotal() {
    let totalScore = 0;
    const form = document.forms["riskform"];

    // Calculate risk score
    for (let i = 0; i < form.elements.length; i++) {
        const element = form.elements[i];

        if (element.name && element.checked) {
            const weightKey = `${element.name}_${element.value}`;
            totalScore += riskWeights[weightKey] || 0;
        }
    }

    const allAnswered = updateProgress();

    // Determine risk level
    let riskLevel = 'low';
    let riskConfig = riskLevels.low;

    for (const [level, config] of Object.entries(riskLevels)) {
        if (totalScore >= config.min && totalScore <= config.max) {
            riskLevel = level;
            riskConfig = config;
            break;
        }
    }

    displayResults(riskLevel, riskConfig, totalScore, allAnswered);
}

function displayResults(level, config, score, allAnswered) {
    const resultDiv = document.getElementById('totalRisk');

    if (!allAnswered) {
        resultDiv.style.display = 'none';
        return;
    }

    // Remove existing classes
    resultDiv.className = 'risk-result';
    resultDiv.classList.add(config.color);

    const riskDescriptions = {
        low: 'Low risk - Document this finding and consider addressing it during regular maintenance cycles or future sprints.',
        medium: 'Medium risk - Plan to address this within the next few weeks. Add monitoring/logging if not already present and consider temporary mitigations.',
        high: 'High risk - Address this within days. Implement immediate workarounds if possible, increase monitoring, and prioritize a permanent fix in your current sprint.',
        critical: 'Critical risk - Take immediate action. Consider taking the affected system offline, implement emergency patches, and treat this as a security incident requiring urgent remediation.'
    };

    const actionItems = {
        low: [
            'Document in threat model or security backlog',
            'Add to next security review agenda',
            'Consider during regular refactoring cycles'
        ],

        medium: [
            'Add logging/monitoring for this vulnerability',
            'Create ticket with 2-4 week timeline',
            'Implement input validation or rate limiting if applicable',
            'Brief team leads on the risk'
        ],

        high: [
            'Create high-priority ticket for current sprint',
            'Implement temporary workarounds immediately',
            'Add alerts and enhanced monitoring',
            'Code review all related components',
            'Update security tests to cover this scenario'
        ],

        critical: [
            'Deploy emergency patch or hotfix',
            'Consider disabling affected features temporarily',
            'Set up real-time monitoring and alerts',
            'Notify security team and management',
            'Conduct incident response procedures',
            'Review and test fix in staging first'
        ]
    };

    resultDiv.innerHTML = `
        <div class="risk-result-content">
            <div class="risk-header">
                <i class="${config.icon}"></i>
                <h3>Risk Level: ${level.charAt(0).toUpperCase() + level.slice(1)}</h3>
                <span class="risk-score">Score: ${score}/10</span>
            </div>
            <p class="risk-description">${riskDescriptions[level]}</p>
            <div class="action-items">
                <h4>Recommended Actions:</h4>
                <ul>
                    ${actionItems[level].map(item => `<li>${item}</li>`).join('')}
                </ul>
            </div>
        </div>
    `;

    resultDiv.style.display = 'block';

    setTimeout(() => {
        resultDiv.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }, 100);

    if (!document.querySelector('#result-styles')) {
        const style = document.createElement('style');
        style.id = 'result-styles';
        style.textContent = `
            .risk-result-content {
                text-align: left;
            }
            .risk-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 1rem;
                flex-wrap: wrap;
                gap: 0.5rem;
            }
            .risk-header h3 {
                margin: 0;
                font-size: 1.25rem;
                flex-grow: 1;
            }
            .risk-score {
                font-size: 0.875rem;
                opacity: 0.8;
                font-weight: 500;
            }
            .risk-description {
                margin-bottom: 1.5rem;
                font-style: italic;
                opacity: 0.9;
            }
            .action-items h4 {
                margin-bottom: 0.75rem;
                font-size: 1rem;
                opacity: 0.9;
            }
            .action-items ul {
                list-style: none;
                padding: 0;
                margin: 0;
            }
            .action-items li {
                padding: 0.5rem 0;
                padding-left: 1.5rem;
                position: relative;
                font-size: 0.875rem;
                line-height: 1.4;
            }
            .action-items li::before {
                content: '→';
                position: absolute;
                left: 0;
                font-weight: bold;
                opacity: 0.7;
            }
            @media (max-width: 640px) {
                .risk-header {
                    flex-direction: column;
                    align-items: flex-start;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

function hideTotal() {
    const resultDiv = document.getElementById('totalRisk');
    if (resultDiv) {
        resultDiv.style.display = 'none';
    }
}

window.addEventListener('error', function (e) {
    console.error('Risk calculator error:', e.error);
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateTotal,
        hideTotal,
        riskWeights,
        riskLevels
    };
}