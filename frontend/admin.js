const API_URL = ''; // Tự động lấy domain hiện tại

// --- HÀM CHUYỂN TAB ---
function showSection(sectionId) {
    // Ẩn tất cả section
    ['dashboard', 'topics', 'qa', 'survey'].forEach(id => {
        document.getElementById('section-' + id).classList.add('d-none');
    });
    // Hiện section được chọn
    document.getElementById('section-' + sectionId).classList.remove('d-none');
    
    // Cập nhật Active class trên menu
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    event.target.classList.add('active');

    // Tải dữ liệu tương ứng
    if (sectionId === 'dashboard') loadStats();
    if (sectionId === 'topics' || sectionId === 'qa') loadTopicsAdmin();
    if (sectionId === 'survey') loadSurveyAdmin();
}

// --- 1. THỐNG KÊ (CHART.JS) ---
let myChart = null;

async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/admin/stats`);
        const data = await response.json();
        
        document.getElementById('total-surveys').innerText = data.total;

        const ctx = document.getElementById('emotionChart').getContext('2d');
        
        // Nếu biểu đồ đã có thì hủy để vẽ lại
        if (myChart) myChart.destroy();

        myChart = new Chart(ctx, {
            type: 'bar', // Hoặc 'pie', 'doughnut'
            data: {
                labels: ['Rất tệ (1)', 'Tệ (2)', 'Bình thường (3)', 'Tốt (4)', 'Rất tốt (5)'],
                datasets: [{
                    label: 'Số lượng học sinh chọn',
                    data: [data.breakdown[1], data.breakdown[2], data.breakdown[3], data.breakdown[4], data.breakdown[5]],
                    backgroundColor: [
                        '#dc3545', // Đỏ
                        '#fd7e14', // Cam
                        '#ffc107', // Vàng
                        '#198754', // Xanh lá
                        '#0d6efd'  // Xanh dương
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true } }
            }
        });

    } catch (error) {
        console.error("Lỗi tải thống kê:", error);
    }
}

// --- 2. QUẢN LÝ CHỦ ĐỀ ---
async function loadTopicsAdmin() {
    const res = await fetch(`${API_URL}/topics`);
    const json = await res.json();
    const list = document.getElementById('admin-topic-list');
    const select = document.getElementById('qa-topic-select');
    
    if (list) list.innerHTML = '';
    if (select) select.innerHTML = '';

    json.data.forEach(topic => {
        // Render List cho tab Chủ đề
        if (list) {
            list.innerHTML += `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span><i class="bi bi-${topic.icon}"></i> ${topic.name}</span>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteTopic(${topic.id})">Xóa</button>
                </li>
            `;
        }
        // Render Select cho tab Q&A
        if (select) {
            select.innerHTML += `<option value="${topic.id}">${topic.name}</option>`;
        }
    });
}

document.getElementById('form-add-topic')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('topic-name').value;
    const icon = document.getElementById('topic-icon').value;
    
    await fetch(`${API_URL}/admin/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, icon })
    });
    alert('Thêm chủ đề thành công!');
    loadTopicsAdmin();
});

async function deleteTopic(id) {
    if(!confirm("Bạn có chắc chắn xóa chủ đề này?")) return;
    await fetch(`${API_URL}/admin/topics/${id}`, { method: 'DELETE' });
    loadTopicsAdmin();
}

// --- 3. QUẢN LÝ Q&A ---
document.getElementById('form-add-qa')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic_id = document.getElementById('qa-topic-select').value;
    const question_text = document.getElementById('qa-question').value;
    const answer_text = document.getElementById('qa-answer').value;

    await fetch(`${API_URL}/admin/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic_id, question_text, answer_text })
    });
    alert('Thêm câu hỏi Q&A thành công!');
    e.target.reset(); // Xóa form
});

// --- 4. QUẢN LÝ KHẢO SÁT ---
async function loadSurveyAdmin() {
    // API này cần sửa lại logic backend nếu muốn lấy ALL câu hỏi (ko phải theo tuần)
    // Tạm thời dùng API weekly để demo, hoặc bạn cần viết API get_all_survey_questions
    const res = await fetch(`${API_URL}/survey/weekly-questions`); 
    const json = await res.json();
    const list = document.getElementById('admin-survey-list');
    list.innerHTML = '';

    json.data.forEach(q => {
        list.innerHTML += `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                ${q.question_text}
                <button class="btn btn-sm btn-outline-danger" onclick="deleteSurvey(${q.id})">Xóa</button>
            </li>
        `;
    });
}

document.getElementById('form-add-survey')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = document.getElementById('survey-question-input').value;
    
    await fetch(`${API_URL}/admin/survey-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_text: text })
    });
    alert('Thêm câu hỏi khảo sát thành công!');
    loadSurveyAdmin();
});

async function deleteSurvey(id) {
    if(!confirm("Xóa câu hỏi này?")) return;
    await fetch(`${API_URL}/admin/survey-questions/${id}`, { method: 'DELETE' });
    loadSurveyAdmin();
}

// Khởi chạy
loadStats();