document.addEventListener('DOMContentLoaded', () => {
    function generateUUID() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }

    // Kiểm tra xem đã có session_id chưa, nếu chưa thì tạo mới
    let chatSessionId = localStorage.getItem('chat_session_id');
    if (!chatSessionId) {
        chatSessionId = generateUUID();
        localStorage.setItem('chat_session_id', chatSessionId);
    }
    // --- CÁC BIẾN QUAN TRỌNG ---
    const API_URL = 'http://127.0.0.1:8000';

    const logoutButton = document.getElementById('logout-button');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatBox = document.getElementById('chat-box');
    const qaTopicsList = document.getElementById('qa-topics-list');
    const qaModal = new bootstrap.Modal(document.getElementById('qa-modal'));
    const qaModalTitle = document.getElementById('qa-modal-title');
    const qaModalBody = document.getElementById('qa-modal-body');
    const surveyQuestionsArea = document.getElementById('survey-questions-area');
    const submitSurveyButton = document.getElementById('submit-survey-button');
    const surveyAdviceArea = document.getElementById('survey-advice-area');

    let isQALoaded = false;
    let isSurveyLoaded = false;
    
    // --- HÀM GỌI API AN TOÀN ---
    async function fetchAPI(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: headers,
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Lỗi máy chủ');
        }
        return response.json();
    }


    // --- LOGIC: TÍNH NĂNG 1 - Q&A ---
    async function loadQATopics() {
        try {
            const data = await fetchAPI('/topics');
            qaTopicsList.innerHTML = '';
            data.data.forEach(topic => {
                const topicButton = document.createElement('button');
                topicButton.className = 'list-group-item list-group-item-action';
                topicButton.innerHTML = `<i class="bi bi-tag-fill me-2"></i> ${topic.name}`;
                topicButton.onclick = () => showQAForTopic(topic);
                qaTopicsList.appendChild(topicButton);
            });
            isQALoaded = true;
        } catch (error) {
            qaTopicsList.innerHTML = `<div class="alert alert-danger">Lỗi tải chủ đề.</div>`;
        }
    }
    
    async function showQAForTopic(topic) {
        qaModalTitle.textContent = topic.name;
        qaModalBody.innerHTML = '<p class="text-center">Đang tải...</p>';
        qaModal.show();
        try {
            const data = await fetchAPI(`/questions/topic/${topic.id}`);
            qaModalBody.innerHTML = '';
            if (data.data.length === 0) {
                qaModalBody.innerHTML = `<p>Chưa có câu hỏi cho chủ đề này.</p>`;
                return;
            }
            const accordion = document.createElement('div');
            accordion.className = 'accordion';
            accordion.id = 'questionsAccordion';
            data.data.forEach((item, index) => {
                accordion.innerHTML += `
                    <div class="accordion-item">
                        <h2 class="accordion-header">
                            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${index}">
                                <strong>Câu ${index + 1}: ${item.question_text}</strong>
                            </button>
                        </h2>
                        <div id="collapse-${index}" class="accordion-collapse collapse" data-bs-parent="#questionsAccordion">
                            <div class="accordion-body">${item.answer_text}</div>
                        </div>
                    </div>
                `;
            });
            qaModalBody.appendChild(accordion);
        } catch (error) {
            qaModalBody.innerHTML = `<div class="alert alert-danger">Lỗi tải câu hỏi.</div>`;
        }
    }

    // --- LOGIC: TÍNH NĂNG 2 - KHẢO SÁT (ĐÃ SỬA) ---
// --- LOGIC: TÍNH NĂNG 2 - KHẢO SÁT (ĐÃ THAY ĐỔI) ---
    
    // Định nghĩa thang đo Likert
    const likertScale = [
        { value: 1, text: 'Rất tệ', icon: '😣'},
        { value: 2, text: 'Tệ', icon: '😥' },
        { value: 3, text: 'Bình thường', icon: '🫥' },
        { value: 4, text: 'Tốt', icon: '☺️' },
        { value: 5, text: 'Rất tốt', icon: '🥰' }
    ];
    // (Bạn có thể đổi text thành "Rất không đồng ý" v.v. nếu muốn)

    async function loadSurveyQuestions() {
    surveyQuestionsArea.innerHTML = `<p class="text-center">Đang tải khảo sát...</p>`;
    surveyAdviceArea.style.display = 'none';
    submitSurveyButton.disabled = false;
    try {
        const data = await fetchAPI('/survey/weekly-questions');
        surveyQuestionsArea.innerHTML = ''; // Xóa chữ "đang tải"
        
        if (data.data.length === 0) {
             surveyQuestionsArea.innerHTML = '<p class="text-muted text-center">Không có câu hỏi khảo sát nào.</p>';
             return;
        }

        data.data.forEach(question => {
                let questionHTML = `
                    <div class="mb-4 survey-question" data-question-id="${question.id}">
                        <p class="mb-2 text-center"><strong>${question.question_text}</strong></p>
                        <div class="likert-options d-flex justify-content-between text-center">
                `;

                likertScale.forEach(option => {
                    questionHTML += `
                        <div class="likert-option">
                            <label for="q-${question.id}-${option.value}" class="likert-label">
                                <input class="form-check-input" type="radio" name="q-${question.id}" value="${option.value}" id="q-${question.id}-${option.value}">
                                
                                <span class="likert-icon">${option.icon}</span> 
                                <span class="likert-text d-block">${option.text}</span>
                            </label>
                        </div>
                    `;
                });

                questionHTML += `
                        </div>
                    </div>
                    <hr class="my-4">
                `;
                surveyQuestionsArea.innerHTML += questionHTML;
            });
        isSurveyLoaded = true;
    } catch (error) {
        surveyQuestionsArea.innerHTML = `<div class="alert alert-danger">Lỗi tải khảo sát. Vui lòng thử lại.</div>`;
    }
}

    submitSurveyButton.addEventListener('click', async () => {
        const answers = [];
        const questions = document.querySelectorAll('.survey-question');
        let allAnswered = true;
        
        questions.forEach(q => {
            const questionId = q.dataset.questionId;
            const selected = q.querySelector(`input[name="q-${questionId}"]:checked`);
            
            if (selected) {
                // Thêm hiệu ứng visual để biết đã chọn
                answers.push({
                    question_id: parseInt(questionId),
                    response_value: parseInt(selected.value)
                });
            } else {
                allAnswered = false;
            }
        });

        if (!allAnswered) {
            alert('Bạn ơi, hãy chọn cảm xúc cho tất cả các câu hỏi nhé! (Kéo lên kiểm tra các dòng chưa sáng màu)');
            return;
        }

        // Bắt đầu gửi
        submitSurveyButton.disabled = true;
        submitSurveyButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Đang gửi...'; // Hiệu ứng loading nút
        
        surveyAdviceArea.style.display = 'block';
        surveyAdviceArea.className = 'alert alert-info';
        surveyAdviceArea.innerHTML = '<div class="d-flex align-items-center"><div class="spinner-grow spinner-grow-sm me-2" role="status"></div> An đang suy nghĩ lời khuyên cho bạn...</div>';

        try {
            console.log("Đang gửi dữ liệu lên server:", JSON.stringify({ answers: answers }));

            const data = await fetchAPI('/survey/submit', {
                method: 'POST',
                body: JSON.stringify({ answers: answers })
            });
            
            console.log("Server trả về:", data); // Kiểm tra log này nếu lỗi

            // THÀNH CÔNG
            surveyAdviceArea.className = 'alert alert-success border-0 shadow-sm';
            surveyAdviceArea.innerHTML = `
                <h5 class="alert-heading"><i class="bi bi-stars text-warning"></i> Lời khuyên từ An:</h5>
                <p class="mb-0" style="font-size: 1.1rem; line-height: 1.6;">${data.positive_advice}</p>
            `;
            
            submitSurveyButton.innerHTML = 'Đã hoàn thành';
            
            // Tải lại câu hỏi sau 5 giây (nếu muốn)
            // setTimeout(loadSurveyQuestions, 5000);

        } catch (error) {
            console.error("Lỗi Survey:", error);
            
            surveyAdviceArea.className = 'alert alert-danger';
            surveyAdviceArea.innerHTML = `
                <strong>Có lỗi xảy ra:</strong> ${error.message} <br>
                <small>Hãy kiểm tra lại Server Terminal (cửa sổ đen chạy uvicorn) để xem chi tiết.</small>
            `;
            
            submitSurveyButton.disabled = false;
            submitSurveyButton.innerHTML = 'Thử lại';
        }
    });

    // --- LOGIC: TÍNH NĂNG 3 - CHATBOT ---
    chatForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const userMessage = chatInput.value.trim();
        if (!userMessage) return;

        addMessageToChatBox('Bạn', userMessage, 'user');
        chatInput.value = '';

        try {
            const data = await fetchAPI('/chat', {
                method: 'POST',
                body: JSON.stringify({ message_text: userMessage, session_id: chatSessionId })
            });
            addMessageToChatBox('An (Bot)', data.response_text, 'bot');
        } catch (error) {
            addMessageToChatBox('Lỗi', error.message, 'bot');
        }
    });

    function addMessageToChatBox(sender, message, type) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${type}`;
        messageElement.innerHTML = `<strong>${sender}</strong> ${message}`;
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // --- BỘ ĐIỀU KHIỂN TAB (LAZY LOADING) ---
    document.getElementById('nav-qa-tab').addEventListener('shown.bs.tab', () => {
        if (!isQALoaded) {
            loadQATopics();
        }
    });

    document.getElementById('nav-survey-tab').addEventListener('shown.bs.tab', (event) => {
        // 'shown.bs.tab' là sự kiện của Bootstrap, báo là tab đã hiển thị xong
        if (!isSurveyLoaded) {
            loadSurveyQuestions();
        }
    });
    function showWelcomeMessage() {
        const chatBox = document.getElementById('chat-box');
        
        // Kiểm tra nếu khung chat đang trống thì mới thêm lời chào
        if (chatBox.innerHTML.trim() === '') {
            const welcomeText = "Chào bạn! 👋 Mình là An, người bạn đồng hành luôn sẵn sàng lắng nghe mọi tâm tư của bạn. <br><br> Hôm nay bạn cảm thấy thế nào? Có chuyện gì vui, buồn hay áp lực muốn kể cho An nghe không?";
            
            // Thêm tin nhắn vào (giả lập độ trễ 0.5s cho tự nhiên)
            setTimeout(() => {
                addMessageToChatBox('An (Bot)', welcomeText, 'bot');
            }, 500);
        }
    }
    // --- KHỞI ĐỘNG ỨNG DỤNG ---
    // Tải tab đầu tiên (Q&A) ngay lập tức
    loadQATopics();

    showWelcomeMessage();
});