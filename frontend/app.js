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
    const API_URL = 'https://edupsy-backend.onrender.com';

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
    // --- LOGIC: TÍNH NĂNG 1 - Q&A (GIAO DIỆN MỚI) ---
    async function loadQATopics() {
        try {
            const data = await fetchAPI('/topics');
            qaTopicsList.innerHTML = '';
            
            // Tạo hiệu ứng xuất hiện dần (Fade in)
            let delay = 0;

            data.data.forEach(topic => {
                // Tạo một cột (Column)
                const colDiv = document.createElement('div');
                colDiv.className = 'col-6 col-md-4 col-lg-3'; // Chia cột: Mobile 2 cột, Tablet 3 cột, PC 4 cột
                
                // Nội dung thẻ Card
                colDiv.innerHTML = `
                    <div class="topic-card h-100">
                        <i class="bi bi-${topic.icon} topic-card-icon"></i>
                        <h5 class="topic-card-title">${topic.name}</h5>
                    </div>
                `;

                // Xử lý sự kiện Click
                const card = colDiv.querySelector('.topic-card');
                card.onclick = () => showQAForTopic(topic);
                
                // Thêm vào danh sách
                qaTopicsList.appendChild(colDiv);
                
                // (Optional) Hiệu ứng Animation đơn giản khi load
                colDiv.style.opacity = '0';
                colDiv.style.transform = 'translateY(20px)';
                colDiv.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                setTimeout(() => {
                    colDiv.style.opacity = '1';
                    colDiv.style.transform = 'translateY(0)';
                }, delay);
                delay += 100; // Mỗi thẻ hiện cách nhau 100ms
            });
            isQALoaded = true;
        } catch (error) {
            qaTopicsList.innerHTML = `<div class="alert alert-danger w-100 text-center">Lỗi tải chủ đề.</div>`;
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
        { value: 3, text: 'Bình thường', icon: '🙂' },
        { value: 4, text: 'Tốt', icon: '☺️' },
        { value: 5, text: 'Rất tốt', icon: '🥰' }
    ];
    // (Bạn có thể đổi text thành "Rất không đồng ý" v.v. nếu muốn)
const surveyInfoForm = document.getElementById('survey-info-form');
    const surveyMainContent = document.getElementById('survey-main-content');
    const surveyFooter = document.getElementById('survey-footer');
    const startSurveyBtn = document.getElementById('start-survey-btn');
    
    // Các input thông tin
    const userNameInput = document.getElementById('user-name');
    const userAgeInput = document.getElementById('user-age');
    const userGenderInput = document.getElementById('user-gender');

    // --- LOGIC: BẮT ĐẦU KHẢO SÁT ---
    startSurveyBtn.addEventListener('click', () => {
        // Kiểm tra dữ liệu
        if (!userNameInput.value || !userAgeInput.value) {
            alert("Vui lòng nhập tên và tuổi của bạn!");
            return;
        }

        // Ẩn form thông tin, hiện câu hỏi
        surveyInfoForm.style.display = 'none';
        surveyMainContent.style.display = 'block';
        surveyFooter.style.display = 'block';
        
        // Tải câu hỏi nếu chưa tải
        if (!isSurveyLoaded) {
            loadSurveyQuestions();
        }
    });
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

    // --- KHỞI TẠO MODAL KẾT QUẢ ---
    const resultModalElement = document.getElementById('surveyResultModal');
    const resultModal = new bootstrap.Modal(resultModalElement);
    const modalUserName = document.getElementById('modal-user-name');
    const modalAdviceText = document.getElementById('modal-advice-text');

    // --- LOGIC: NỘP BÀI (CẬP NHẬT) ---
    submitSurveyButton.addEventListener('click', async () => {
        const answers = [];
        const questions = document.querySelectorAll('.survey-question');
        let allAnswered = true;
        
        questions.forEach(q => {
            const questionId = q.dataset.questionId;
            const selected = q.querySelector(`input[type="radio"]:checked`);
            
            if (selected) {
                answers.push({
                    question_id: parseInt(questionId),
                    response_value: parseInt(selected.value)
                });
            } else {
                allAnswered = false;
            }
        });

        if (!allAnswered) {
            alert('Bạn vui lòng trả lời hết các câu hỏi nhé!');
            return;
        }

        // 1. Hiệu ứng Loading trên nút bấm
        const originalBtnText = submitSurveyButton.innerHTML;
        submitSurveyButton.disabled = true;
        submitSurveyButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Đang phân tích...';

        try {
            const submissionData = {
                full_name: userNameInput.value || "Bạn", 
                age: parseInt(userAgeInput.value) || 0,
                gender: userGenderInput.value || "Khác",
                answers: answers
            };

            // 2. Gọi API
            const data = await fetchAPI('/survey/submit', {
                method: 'POST',
                body: JSON.stringify(submissionData)
            });

            // 3. Xử lý hiển thị Popup
            // Điền tên người dùng
            modalUserName.innerText = `Gửi ${submissionData.full_name},`;
            
            // Điền lời khuyên từ AI (dùng typeWriterEffect để gõ chữ cho sinh động nếu muốn, ở đây dùng text thường cho nhanh)
            modalAdviceText.innerHTML = data.positive_advice;

            // BẬT POPUP LÊN!
            resultModal.show();
            
            // Ẩn nút nộp bài đi sau khi thành công
            submitSurveyButton.style.display = 'none';

        } catch (error) {
            alert(`Lỗi: ${error.message}`);
            // Trả lại nút bấm nếu lỗi
            submitSurveyButton.disabled = false;
            submitSurveyButton.innerHTML = originalBtnText;
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

// ... (Phần trên giữ nguyên)

    // --- LOGIC MỚI: HIỂN THỊ TIN NHẮN VỚI HIỆU ỨNG (Đã Fix lỗi HTML) ---
    
    function addMessageToChatBox(sender, message, type) {
        const chatBox = document.getElementById('chat-box');
        
        // Xử lý xuống dòng: Thay thế \n thành <br> trước khi đưa vào hiệu ứng
        // Điều này rất quan trọng vì AI thường trả về \n
        if (type === 'bot') {
            message = message.replace(/\n/g, '<br>');
        }

        const rowDiv = document.createElement('div');
        rowDiv.className = `message-row ${type}`;
        
        let htmlContent = '';
        if (type === 'bot') {
            htmlContent += `
                <div class="bot-avatar">
                    <i class="fa-brands fa-bluesky fa-bounce" style="color: #B197FC;"></i>
                </div>
            `;
        }

        htmlContent += `
            <div class="message">
                ${type === 'user' ? message : ''} 
            </div>
        `;

        rowDiv.innerHTML = htmlContent;
        chatBox.appendChild(rowDiv);
        chatBox.scrollTop = chatBox.scrollHeight;

        if (type === 'bot') {
            const messageDiv = rowDiv.querySelector('.message');
            typeWriterEffect(messageDiv, message);
        }
    }

    // HÀM GÕ CHỮ THÔNG MINH (Bỏ qua thẻ HTML)
    function typeWriterEffect(element, text, index = 0) {
        if (index < text.length) {
            // KIỂM TRA: Ký tự hiện tại có phải là bắt đầu thẻ HTML không?
            if (text.charAt(index) === '<') {
                // Tìm vị trí đóng thẻ '>'
                let endIndex = text.indexOf('>', index);
                
                if (endIndex !== -1) {
                    // Nếu tìm thấy, in NGUYÊN CỤM thẻ đó luôn (ví dụ: <br> hoặc <b>)
                    element.innerHTML += text.substring(index, endIndex + 1);
                    
                    // Cập nhật index nhảy cóc qua thẻ này
                    index = endIndex + 1;
                    
                    // Gọi đệ quy ngay lập tức (không delay) để xử lý ký tự tiếp theo
                    typeWriterEffect(element, text, index);
                    return;
                }
            }

            // NẾU LÀ CHỮ THƯỜNG: In từng chữ và có delay
            element.innerHTML += text.charAt(index);
            
            // Tự động cuộn
            const chatBox = document.getElementById('chat-box');
            chatBox.scrollTop = chatBox.scrollHeight;

            // Chờ 20ms rồi gõ chữ tiếp theo
            setTimeout(() => {
                typeWriterEffect(element, text, index + 1);
            }, 20); 
        }
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
            const welcomeText = "Chào bạn! 👋 Mình là Diệu, người bạn đồng hành luôn sẵn sàng lắng nghe mọi tâm tư của bạn. <br><br> Hôm nay bạn cảm thấy thế nào? Có chuyện gì vui, buồn hay áp lực muốn kể cho Diệu nghe không?";
            
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
