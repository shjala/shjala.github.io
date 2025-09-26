
var threat_level = new Array();
threat_level["expertise_layman"] = [0, 'E|L'];
threat_level["expertise_proficient"] = [1, 'E|P'];
threat_level["expertise_expert"] = [2, 'E|E'];
threat_level["expertise_multiple_experts"] = [3, 'E|ME'];

threat_level["knowledge_public"] = [0, 'K|P'];
threat_level["knowledge_restricted"] = [1, 'K|R'];
threat_level["knowledge_sensitive"] = [2, 'K|S'];
threat_level["knowledge_critical"] = [3, 'K|C'];

threat_level["wop_unlimited"] = [0, 'W|U'];
threat_level["wop_large"] = [2, 'W|L'];
threat_level["wop_medium"] = [3, 'W|M'];
threat_level["wop_small"] = [4, 'W|S'];

threat_level["equipment_standard"] = [0, 'EQ|ST'];
threat_level["equipment_specialised"] = [1, 'EQ|SP'];
threat_level["equipment_bespoke"] = [2, 'EQ|B'];
threat_level["equipment_multiple_bespoke"] = [3, 'EQ|MB'];

var impact_level = new Array();
impact_level["none"] = [0, 'N'];
impact_level["low"] = [1, 'L'];
impact_level["medium"] = [10, 'M'];
impact_level["high"] = [100, 'H'];

var sl_mapping = new Array();
sl_mapping["None"] = 0;
sl_mapping["Low"] = 1;
sl_mapping["Medium"] = 2;
sl_mapping["High"] = 3;
sl_mapping["Critical"] = 4;

var security_level = [
    ["QM", "QM", "QM", "QM", "Low"],
    ["QM", "Low", "Low", "Low", "Medium"],
    ["QM", "Low", "Medium", "Medium", "High"],
    ["QM", "Low", "Medium", "High", "High"],
    ["Low", "Medium", "High", "High", "Critical"]
];


function getValue(elem, level) {
    var value = 0;
    var abbr = "";

    var theForm = document.forms["riskform"];
    var selectedElem = theForm.elements[elem];

    for (var i = 0; i < selectedElem.length; i++) {

        if (selectedElem[i].checked) {

            value = level[selectedElem[i].value][0];
            abbr = level[selectedElem[i].value][1];
            break;
        }
    }

    return [value, abbr];
}

function calculateTotal() {
    var threat = "";
    var threat_abbr = "";
    tl_level_sum = 0;

    [v, a] = getValue("tl_expertise", threat_level);
    tl_level_sum = v;
    threat_abbr = a;

    [v, a] = getValue("tl_knowledge", threat_level)
    tl_level_sum += v;
    threat_abbr += "-" + a;

    [v, a] = getValue("tl_wop", threat_level);
    tl_level_sum += v;
    threat_abbr += "-" + a;

    [v, a] = getValue("tl_equipment", threat_level);
    tl_level_sum += v;
    threat_abbr += "-" + a;

    if (tl_level_sum > 9) {
        threat = "None";
    } else if (tl_level_sum >= 7 && tl_level_sum <= 9) {
        threat = "Low";
    } else if (tl_level_sum >= 4 && tl_level_sum <= 6) {
        threat = "Medium";
    } else if (tl_level_sum >= 2 && tl_level_sum <= 3) {
        threat = "High";
    } else if (tl_level_sum >= 0 && tl_level_sum <= 2) {
        threat = "Critical";
    }

    var impact = "";
    var impact_abbr = "";
    var il_level_sum = 0;

    [v, a] = getValue("il_safety", impact_level);
    il_level_sum = v * 10;
    impact_abbr += "S|" + a;

    [v, a] = getValue("il_financial", impact_level);
    il_level_sum += v * 10;
    impact_abbr += "-F|" + a;

    [v, a] = getValue("il_operational", impact_level);
    il_level_sum += v;
    impact_abbr += "-O|" + a;

    [v, a] = getValue("il_privacy", impact_level);
    il_level_sum += v;
    impact_abbr += "-P|" + a;

    if (il_level_sum == 0) {
        impact = "None";
    } else if (il_level_sum >= 1 && il_level_sum <= 19) {
        impact = "Low";
    } else if (il_level_sum >= 20 && il_level_sum <= 99) {
        impact = "Medium";
    } else if (il_level_sum >= 100 && il_level_sum <= 999) {
        impact = "High";
    } else if (il_level_sum >= 1000) {
        impact = "Critical";
    }

    sec_level = security_level[sl_mapping[threat]][sl_mapping[impact]]

    var divobj = document.getElementById('totalRisk');
    divobj.style.display = 'block';
    divobj.className = 'risk-result';

    var riskClass = sec_level.toLowerCase();
    if (riskClass === 'qm') {
        riskClass = 'low';  // QM maps to low risk styling
    }
    divobj.classList.add(riskClass);

    var icon = '';
    switch (riskClass) {
        case 'low':
            icon = '<i class="fas fa-shield-check"></i> ';
            break;
        case 'medium':
            icon = '<i class="fas fa-shield-exclamation"></i> ';
            break;
        case 'high':
            icon = '<i class="fas fa-shield-virus"></i> ';
            break;
        case 'critical':
            icon = '<i class="fas fa-shield-slash"></i> ';
            break;
        default:
            icon = '<i class="fas fa-shield-alt"></i> ';
    }

    divobj.innerHTML = icon + "Threat Level: " + threat + " (" + tl_level_sum + ")" + " (" + threat_abbr + ")<br/>";
    divobj.innerHTML += "Impact Level: " + impact + " (" + il_level_sum + ")" + " (" + impact_abbr + ")<br/>";
    divobj.innerHTML += "<strong>Security Level: " + sec_level + "</strong>";
}


function hideTotal() {
    var divobj = document.getElementById('totalRisk');
    divobj.style.display = 'none';
}

function toggleDescription(button) {
    var optionContainer = button.closest('.option-container');
    var description = optionContainer.querySelector('.option-description');
    var icon = button.querySelector('i');

    if (description.classList.contains('show')) {
        description.classList.remove('show');
        icon.className = 'fas fa-info-circle';
        button.setAttribute('aria-expanded', 'false');
    } else {
        description.classList.add('show');
        icon.className = 'fas fa-times-circle';
        button.setAttribute('aria-expanded', 'true');
    }
}