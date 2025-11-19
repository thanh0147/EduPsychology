document.addEventListener('DOMContentLoaded', () => {

    const API_URL = 'http://127.0.0.1:8000'; // Đảm bảo backend đang chạy

    // Lấy các phần tử
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const messageArea = document.getElementById('message-area');

    // TÍNH NĂNG 1: TỰ ĐỘNG CHUYỂN HƯỚNG NẾU ĐÃ ĐĂNG NHẬP
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
        // Nếu đã có token, không cần ở lại trang login
        window.location.href = 'index.html'; // Chuyển đến trang app
    }

    // TÍNH NĂNG 2: XỬ LÝ ĐĂNG NHẬP
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        messageArea.textContent = '';

        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: emailInput.value,
                    password: passwordInput.value
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                messageArea.textContent = data.detail || 'Lỗi không xác định.';
            } else {
                // ĐĂNG NHẬP THÀNH CÔNG
                localStorage.setItem('accessToken', data.access_token);
                // Chuyển hướng sang trang app
                window.location.href = 'index.html';
            }
        } catch (error) {
            console.error('Lỗi đăng nhập:', error);
            messageArea.textContent = 'Không thể kết nối đến máy chủ.';
        }
    });
});