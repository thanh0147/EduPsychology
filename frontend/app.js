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
    const searchInput = document.getElementById('qa-search-input');

    async function loadQATopics() {
        try {
            const data = await fetchAPI('/topics');
            qaTopicsList.innerHTML = '';
            
            let delay = 0;

            data.data.forEach(topic => {
                const colDiv = document.createElement('div');
                // Thêm class 'topic-item' để dùng cho chức năng tìm kiếm
                colDiv.className = 'col-6 col-md-4 col-lg-3 topic-item'; 
                
                // Lưu tên chủ đề vào thuộc tính data-name để tìm kiếm cho nhanh
                colDiv.setAttribute('data-name', topic.name.toLowerCase());

                colDiv.innerHTML = `
                    <div class="topic-card h-100">
                        <i class="bi bi-${topic.icon} topic-card-icon"></i>
                        <h5 class="topic-card-title">${topic.name}</h5>
                    </div>
                `;

                const card = colDiv.querySelector('.topic-card');
                card.onclick = () => showQAForTopic(topic);
                
                qaTopicsList.appendChild(colDiv);
                
                // Animation
                colDiv.style.opacity = '0';
                colDiv.style.transform = 'translateY(20px)';
                colDiv.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                setTimeout(() => {
                    colDiv.style.opacity = '1';
                    colDiv.style.transform = 'translateY(0)';
                }, delay);
                delay += 50; 
            });
            isQALoaded = true;
        } catch (error) {
            qaTopicsList.innerHTML = `<div class="alert alert-danger w-100 text-center">Lỗi tải chủ đề.</div>`;
        }
    }

    // --- SỰ KIỆN TÌM KIẾM (Lọc danh sách ngay khi gõ) ---
    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            const searchText = e.target.value.toLowerCase(); // Lấy chữ người dùng nhập
            const items = document.querySelectorAll('.topic-item'); // Lấy tất cả các cột chủ đề

            items.forEach(item => {
                const topicName = item.getAttribute('data-name'); // Lấy tên chủ đề đã lưu
                
                // Kiểm tra: Nếu tên chứa từ khóa tìm kiếm -> Hiện, ngược lại -> Ẩn
                if (topicName.includes(searchText)) {
                    item.classList.remove('d-none'); // Hiện
                } else {
                    item.classList.add('d-none'); // Ẩn (Dùng class của Bootstrap)
                }
            });
        });
    }
    
    // --- BIẾN TOÀN CỤC ---
    // (Đảm bảo bạn đã có biến chatSessionId được tạo ở đầu file như hướng dẫn trước)
    // Nếu chưa, thêm dòng này vào đầu file app.js:
    // const chatSessionId = localStorage.getItem('chat_session_id') || 'guest_' + Date.now();

    // --- HÀM HIỂN THỊ CÂU HỎI (DẠNG NHẬP LIỆU) ---
    async function showQAForTopic(topic) {
        qaModalTitle.textContent = topic.name;
        qaModalBody.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>';
        qaModal.show();
        
        try {
            // Gọi API lấy câu hỏi
            const data = await fetchAPI(`/questions/topic/${topic.id}`);
            qaModalBody.innerHTML = '';
            
            if (!data.data || data.data.length === 0) {
                qaModalBody.innerHTML = `<p class="text-center text-muted">Chưa có câu hỏi nào cho chủ đề này.</p>`;
                return;
            }

            const accordion = document.createElement('div');
            accordion.className = 'accordion accordion-flush';
            accordion.id = 'questionsAccordion';
            
            data.data.forEach((item) => {
                // Ưu tiên lấy answer_text, nếu không có thì lấy answer_yes (dự phòng)
                const finalAnswer = item.answer_text || item.answer_yes || "Đang cập nhật câu trả lời...";

                accordion.innerHTML += `
                    <div class="accordion-item bg-transparent mb-3 border-0">
                        <h2 class="accordion-header">
                            <button class="accordion-button collapsed shadow-sm rounded-3 fw-bold text-primary" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${item.id}">
                                <i class="bi bi-patch-question-fill me-2"></i> ${item.question_text}
                            </button>
                        </h2>
                        <div id="collapse-${item.id}" class="accordion-collapse collapse" data-bs-parent="#questionsAccordion">
                            <div class="accordion-body bg-white rounded-3 mt-2 shadow-sm p-4">
                                
                                <div id="qa-input-section-${item.id}">
                                    <label class="form-label fw-bold text-muted small text-uppercase">
                                        🤔<i class="bi bi-pencil-fill me-1"></i>Suy nghĩ của bạn
                                    </label>
                                    <textarea id="qa-thought-${item.id}" class="form-control mb-3" rows="3" 
                                        placeholder="Theo bạn thì sao? Hãy ghi lại suy nghĩ của mình trước khi xem đáp án nhé..." 
                                        style="background: #f8f9fa; border: 2px dashed #dee2e6;"></textarea>
                                    
                                    <div class="d-grid">
                                        <button class="btn btn-primary rounded-pill fw-bold" onclick="submitQAThought(${item.id})">
                                            Gửi suy nghĩ & Xem đáp án <i class="bi bi-magic ms-2"></i>
                                        </button>
                                    </div>
                                </div>

                                <div id="qa-answer-section-${item.id}" style="display: none;">
                                    
                                    <div class="mb-3 p-3 bg-light rounded border-start border-4 border-primary">
                                        <small class="text-muted d-block fw-bold mb-1">Bạn đã nghĩ rằng:</small>
                                        <em class="text-secondary fst-italic" id="user-prev-thought-${item.id}">...</em>
                                    </div>

                                    <div class="alert alert-success border-0 bg-opacity-10 bg-success shadow-sm">
                                        <h6 class="alert-heading fw-bold mb-2 text-success">
                                            <i class="bi bi-lightbulb-fill me-2"></i>Góc nhìn tâm lý:
                                        </h6>
                                        <div style="line-height: 1.8; white-space: pre-line;">${finalAnswer}</div>
                                    </div>

                                    <div class="text-center mt-3">
                                        <button class="btn btn-sm btn-outline-secondary rounded-pill px-3" onclick="resetQAInput(${item.id})">
                                            <i class="bi bi-arrow-repeat me-1"></i> Viết lại suy nghĩ
                                        </button>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                `;
            });
            qaModalBody.appendChild(accordion);
        } catch (error) {
            console.error(error);
            qaModalBody.innerHTML = `<div class="alert alert-danger">Lỗi tải dữ liệu: ${error.message}</div>`;
        }
    }

    // --- HÀM XỬ LÝ GỬI SUY NGHĨ ---
    window.submitQAThought = async function(questionId) {
        const inputArea = document.getElementById(`qa-input-section-${questionId}`);
        const answerArea = document.getElementById(`qa-answer-section-${questionId}`);
        const textarea = document.getElementById(`qa-thought-${questionId}`);
        const prevThoughtDisplay = document.getElementById(`user-prev-thought-${questionId}`);
        
        const userThought = textarea.value.trim();

        if (!userThought) {
            alert("Bạn ơi, hãy thử viết vài dòng suy nghĩ của mình nhé!");
            textarea.focus();
            return;
        }

        // Khóa giao diện tạm thời
        const btn = inputArea.querySelector('button');
        const originalBtnText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Đang lưu...';
        btn.disabled = true;

        try {
            // Gửi về Server
            await fetchAPI('/qa/submit-thought', {
                method: 'POST',
                body: JSON.stringify({
                    question_id: parseInt(questionId),
                    user_thought: userThought,
                    session_id: localStorage.getItem('chat_session_id') || 'guest_' + Date.now()
                })
            });

            // Hiển thị kết quả
            inputArea.style.display = 'none';
            answerArea.style.display = 'block';
            prevThoughtDisplay.innerText = userThought;
            
            // Hiệu ứng hiện ra
            answerArea.style.opacity = '0';
            answerArea.style.transform = 'translateY(10px)';
            answerArea.style.transition = 'all 0.5s ease';
            
            setTimeout(() => {
                answerArea.style.opacity = '1';
                answerArea.style.transform = 'translateY(0)';
            }, 50);

        } catch (error) {
            alert("Lỗi kết nối: " + error.message);
            btn.innerHTML = originalBtnText;
            btn.disabled = false;
        }
    };

    // --- HÀM RESET (Nếu muốn nhập lại) ---
    window.resetQAInput = function(id) {
        const inputArea = document.getElementById(`qa-input-section-${id}`);
        const answerArea = document.getElementById(`qa-answer-section-${id}`);
        const btn = inputArea.querySelector('button');
        
        inputArea.style.display = 'block';
        answerArea.style.display = 'none';
        
        // Reset nút bấm
        btn.disabled = false;
        btn.innerHTML = 'Gửi suy nghĩ & Xem đáp án <i class="bi bi-magic ms-2"></i>';
    };

    
    // --- HÀM XỬ LÝ KHI CHỌN YES/NO ---
    window.selectQAOption = function(id, type, encodedAnswer) {
        const optionArea = document.getElementById(`qa-options-${id}`);
        const resultArea = document.getElementById(`qa-result-${id}`);
        const alertBox = document.getElementById(`qa-alert-${id}`);
        
        // Giải mã nội dung tin nhắn (vì ta đã encode ở trên để tránh lỗi ký tự đặc biệt)
        const answerText = decodeURIComponent(encodedAnswer);

        // Ẩn nút chọn
        optionArea.style.display = 'none';
        
        // Hiện kết quả
        resultArea.style.display = 'block';
        
        // Đổi màu thông báo tùy theo chọn Có hay Không
        if (type === 'yes') {
            alertBox.className = 'alert alert-success bg-opacity-10 bg-success'; // Màu xanh
            alertBox.innerHTML = `<h6 class="fw-bold"><i class="bi bi-check-circle-fill"></i> Lời khuyên:</h6> ${answerText}`;
        } else {
            alertBox.className = 'alert alert-secondary bg-opacity-10 bg-secondary'; // Màu xám/đỏ nhẹ
            alertBox.innerHTML = `<h6 class="fw-bold"><i class="bi bi-heart-fill"></i> Lời khuyên:</h6> ${answerText}`;
        }
        
        // Hiệu ứng Fade in
        resultArea.style.opacity = 0;
        setTimeout(() => {
            resultArea.style.transition = 'opacity 0.5s';
            resultArea.style.opacity = 1;
        }, 50);
    };

    // --- HÀM RESET ĐỂ CHỌN LẠI ---
    window.resetQAOption = function(id) {
        document.getElementById(`qa-options-${id}`).style.display = 'block';
        document.getElementById(`qa-result-${id}`).style.display = 'none';
    };

    // --- HÀM XỬ LÝ KHI BẤM NÚT GỬI ---
    // (Phải gán vào window để HTML gọi được onclick)
    window.submitQAThought = async function(questionId) {
        const inputArea = document.getElementById(`qa-input-section-${questionId}`);
        const answerArea = document.getElementById(`qa-answer-section-${questionId}`);
        const textarea = document.getElementById(`qa-thought-${questionId}`);
        const prevThoughtDisplay = document.getElementById(`user-prev-thought-${questionId}`);
        
        const userThought = textarea.value.trim();

        if (!userThought) {
            alert("Bạn hãy nhập một chút suy nghĩ của mình nhé!");
            textarea.focus();
            return;
        }

        // Cập nhật giao diện ngay lập tức cho mượt
        inputArea.style.opacity = '0.5';
        inputArea.style.pointerEvents = 'none'; // Khóa nút lại

        try {
            // Gửi về Server (Backend lưu lại)
            await fetchAPI('/qa/submit-thought', {
                method: 'POST',
                body: JSON.stringify({
                    question_id: parseInt(questionId),
                    user_thought: userThought,
                    session_id: localStorage.getItem('chat_session_id') || 'guest'
                })
            });

            // Hiển thị kết quả
            inputArea.style.display = 'none'; // Ẩn khung nhập
            answerArea.style.display = 'block'; // Hiện đáp án
            prevThoughtDisplay.innerText = userThought; // Hiện lại cái user vừa nhập
            
            // Hiệu ứng Fade in cho đáp án
            answerArea.style.opacity = '0';
            setTimeout(() => {
                answerArea.style.transition = 'opacity 0.5s';
                answerArea.style.opacity = '1';
            }, 50);

        } catch (error) {
            alert("Lỗi kết nối: " + error.message);
            inputArea.style.opacity = '1';
            inputArea.style.pointerEvents = 'auto';
        }
    };

    // --- LOGIC: TÍNH NĂNG 2 - KHẢO SÁT (ĐÃ SỬA) ---
// --- LOGIC: TÍNH NĂNG 2 - KHẢO SÁT (ĐÃ THAY ĐỔI) ---
    
    // Định nghĩa thang đo Likert
    // Bộ 1: Cảm xúc / Đánh giá (Cũ)
    const scaleRating = [
        { value: 1, text: "Rất tệ", icon: "😫" },
        { value: 2, text: "Tệ", icon: "😣" }, // Icon class của bạn
        { value: 3, text: "Bình thường", icon: "😐" },
        { value: 4, text: "Tốt", icon: "🙂" },
        { value: 5, text: "Rất tốt", icon: "🤩" }
    ];

    // Bộ 2: Tần suất (Mới)
    const scaleFrequency = [
        { value: 1, text: "Không bao giờ", icon: "🚫" },
        { value: 2, text: "Hiếm khi", icon: "📉" },
        { value: 3, text: "Thi thoảng", icon: "⚡" },
        { value: 4, text: "Thường xuyên", icon: "repeat" }, // Dùng icon bootstrap
        { value: 5, text: "Luôn luôn", icon: "infinity" }   // Dùng icon bootstrap
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
        // 1. Hiển thị 5 câu trắc nghiệm (Giữ nguyên logic cũ)
            data.data.forEach((question, index) => {
                // KIỂM TRA LOẠI CÂU HỎI ĐỂ CHỌN THANG ĐO
                // Nếu DB trả về 'frequency' thì dùng bộ Tần suất, ngược lại dùng bộ Đánh giá
                const currentScale = (question.question_type === 'frequency') ? scaleFrequency : scaleRating;

                let questionHTML = `
                    <div class="mb-5 survey-question" data-question-id="${question.id}">
                        <p class="mb-3"><strong>Câu ${index + 1}: ${question.question_text}</strong></p>
                        
                        <div class="likert-options d-flex justify-content-between text-center">
                            ${currentScale.map(option => {
                                // Xử lý icon: Nếu là emoji thì hiện thẳng, nếu là class bootstrap thì dùng thẻ <i>
                                // Ở đây mình giả sử bạn dùng Emoji cho nhanh, hoặc bạn có thể chỉnh lại class
                                let iconDisplay = option.icon;
                                if (option.icon.length > 2) { 
                                    // Nếu tên icon dài (ví dụ 'repeat'), coi như là class Bootstrap
                                    iconDisplay = `<i class="bi bi-${option.icon}" style="font-size: 2rem;"></i>`;
                                }

                                return `
                                <div class="likert-option">
                                    <label class="likert-label">
                                        <input class="form-check-input" type="radio" name="q-${question.id}" value="${option.value}">
                                        <span class="likert-icon">${iconDisplay}</span> 
                                        <span class="likert-text d-block">${option.text}</span>
                                    </label>
                                </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
                surveyQuestionsArea.innerHTML += questionHTML;
            });
            // 2. THÊM CÂU HỎI TỰ LUẬN (CÂU CUỐI CÙNG) - MỚI
            surveyQuestionsArea.innerHTML += `
                <hr class="my-5">
                <div class="mb-4">
                    <label for="daily-note" class="form-label fw-bold" style="font-size: 1.2rem; color: var(--bs-primary);">
                        <i class="bi bi-pen me-2"></i>Điều gì bạn muốn kể với mình hôm nay?
                    </label>
                    <textarea id="daily-note" class="form-control" rows="3" 
                        placeholder="Kể cho Zizi nghe bất cứ điều gì (vui, buồn, bí mật...)" 
                        style="background: rgba(255,255,255,0.5); backdrop-filter: blur(10px); border-radius: 15px;"></textarea>
                </div>
            `;
            
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
            const dailyNoteInput = document.getElementById('daily-note');
            
            // Lấy giá trị (nếu không tìm thấy element thì để rỗng)
            const noteValue = dailyNoteInput ? dailyNoteInput.value.trim() : "";

            console.log("📝 Tâm sự gửi đi:", noteValue); // [DEBUG] Xem console có in ra chữ không

            const submissionData = {
                full_name: userNameInput.value || "Ẩn danh",
                age: parseInt(userAgeInput.value) || 0,
                gender: userGenderInput.value || "Khác",
                daily_note: noteValue, // <--- GỬI ĐI Ở ĐÂY
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
            const welcomeText = "Chào bạn! 👋 Mình là Zizi, người bạn đồng hành luôn sẵn sàng lắng nghe mọi tâm tư của bạn. <br><br> Hôm nay bạn cảm thấy thế nào? Có chuyện gì vui, buồn hay áp lực muốn kể cho Zizi nghe không?";
            
            // Thêm tin nhắn vào (giả lập độ trễ 0.5s cho tự nhiên)
            setTimeout(() => {
                addMessageToChatBox('Zizi (Bot)', welcomeText, 'bot');
            }, 500);
        }
    }
    // --- KHỞI ĐỘNG ỨNG DỤNG ---
    // Tải tab đầu tiên (Q&A) ngay lập tức
    loadQATopics();

    showWelcomeMessage();
});
