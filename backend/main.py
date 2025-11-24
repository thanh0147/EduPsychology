import os
from fastapi import FastAPI, HTTPException, Path, Query, Depends
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime
from pydantic import BaseModel, Field, EmailStr
from typing import List
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from supabase import create_client, Client
from supabase.lib.client_options import ClientOptions
from groq import Groq
from fastapi.middleware.cors import CORSMiddleware
# --- 1. NẠP "CHÌA KHÓA" TỪ FILE .ENV ---
load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
# Code mới (gọn gàng, vẫn chạy đúng)
supabase: Client = create_client(url, key)
if not url or not key:
    raise EnvironmentError("SUPABASE_URL và SUPABASE_KEY phải được cài đặt trong file .env")

# --- 2. KẾT NỐI VỚI SUPABASE ---
try:
    supabase: Client = create_client(url, key)
    print("Kết nối Supabase thành công!")
except Exception as e:
    print(f"Lỗi khi kết nối Supabase: {e}")
    exit(1)
# --- 2. THIẾT LẬP "BỘ NÃO" AI (CLIENT GROQ) ---
# Nó sẽ tự động đọc GROQ_API_KEY từ file .env
try:
    client_ai = Groq() # <--- THAY ĐỔI
except Exception as e:
    print(f"Lỗi khi khởi tạo Groq: {e}. Bạn đã thêm GROQ_API_KEY vào .env chưa?") # <--- THAY ĐỔI

# --- 3. KHỞI TẠO APP FASTAPI ---
app = FastAPI(
    title="Web Tư Vấn Học Đường API",
    description="Backend cho dự án Q&A, Khảo sát và Chatbot",
    version="1.0.0"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # <--- THAY ĐỔI Ở ĐÂY (cho phép tất cả)
    allow_credentials=True,
    allow_methods=["*"], # Đã cho phép * (bao gồm cả OPTIONS và POST)
    allow_headers=["*"], # Đã cho phép * (bao gồm cả Content-Type)
)
class SurveyAnswerInput(BaseModel):
    """Đại diện cho 1 câu trả lời khảo sát"""
    question_id: int = Field(..., ge=1) # ID câu hỏi phải >= 1
    # Giá trị Likert phải từ 1 đến 5
    response_value: int = Field(..., ge=1, le=5)

class SurveySubmissionInput(BaseModel):
    """Đại diện cho toàn bộ bài nộp, là 1 danh sách các câu trả lời"""
    answers: List[SurveyAnswerInput]
    
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class ChatInput(BaseModel):
    message_text: str
    session_id: str
# --- 4. ĐỊNH NGHĨA API ĐẦU TIÊN (ENDPOINT) ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
@app.get("/")
def read_root():
    """Điểm chào mừng!"""
    return {"message": "Chào mừng bạn đến với API Tư vấn Học đường!"}


@app.get("/topics")
def get_all_topics():
    """
    API này lấy TẤT CẢ các chủ đề (keywords) Q&A
    từ bảng 'topics' trong Supabase.
    """
    try:
        # Dùng client Supabase để "chọn tất cả" từ bảng "topics"
        response = supabase.table('topics').select('*').execute()
        
        # 'response.data' là nơi chứa danh sách dữ liệu
        data = response.data
        
        return {
            "message": "Lấy danh sách chủ đề thành công!",
            "data": data
        }
        
    except Exception as e:
        print(f"Lỗi khi lấy dữ liệu topics: {e}")
        # Nếu có lỗi, trả về lỗi 500
        raise HTTPException(status_code=500, detail=f"Lỗi máy chủ nội bộ: {str(e)}")
    
# =========== API MỚI CỦA BẠN BẮT ĐẦU TỪ ĐÂY ===========

@app.get("/questions/topic/{topic_id}")
def get_random_questions_for_topic(
    # {topic_id} trên URL sẽ được đưa vào biến topic_id này
    # Path(...) giúp xác thực dữ liệu: phải là số nguyên, lớn hơn 0
    topic_id: int = Path(..., title="ID của Chủ đề", ge=1)
):
    """
    API này lấy 10 câu hỏi NGẪU NHIÊN thuộc một chủ đề cụ thể.
    Nó gọi hàm 'get_random_questions' mà chúng ta đã tạo trong Supabase.
    """
    try:
        # Đây là lúc gọi "tuyệt chiêu" (SQL Function)
        # 'rpc' là viết tắt của 'Remote Procedure Call'
        response = supabase.rpc(
            'get_random_questions',           # Tên hàm SQL
            {'p_topic_id': topic_id}          # Tham số truyền vào hàm
        ).execute()

        data = response.data
        
        if not data:
            # Vẫn trả về thành công, nhưng là một danh sách rỗng
            return {
                "message": f"Không tìm thấy câu hỏi nào cho chủ đề ID {topic_id}",
                "data": []
            }

        return {
            "message": f"Lấy 10 câu hỏi ngẫu nhiên cho chủ đề ID {topic_id} thành công!",
            "data": data
        }

    except Exception as e:
        print(f"Lỗi khi gọi RPC get_random_questions: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi máy chủ nội bộ: {str(e)}")
    
@app.get("/questions/search")
def search_questions(
    # Sử dụng Query(...) để yêu cầu tham số 'q'
    # 'q' sẽ lấy từ URL (ví dụ: .../search?q=từ_khóa)
    # min_length=3: Yêu cầu người dùng nhập ít nhất 3 ký tự
    q: str = Query(..., min_length=3, description="Từ khóa tìm kiếm (ít nhất 3 ký tự)")
):
    """
    API này tìm kiếm từ khóa trong cả câu hỏi (question_text)
    và câu trả lời (answer_text) không phân biệt hoa thường.
    """
    try:
        # Thêm ký tự '%' vào đầu và cuối từ khóa
        # '%' là ký tự đại diện, nghĩa là "tìm bất cứ thứ gì có chứa 'q'"
        search_term = f"%{q}%"

        # Sử dụng hàm .or_() của Supabase
        # Cú pháp: "cột.toán_tử.giá_trị, cột_khác.toán_tử.giá_trị"
        filter_query = f"question_text.ilike.{search_term},answer_text.ilike.{search_term}"

        response = supabase.table('questions') \
                           .select('*') \
                           .or_(filter_query) \
                           .limit(20) \
                           .execute() # Giới hạn 20 kết quả

        data = response.data

        return {
            "message": f"Tìm thấy {len(data)} kết quả cho '{q}'",
            "data": data
        }

    except Exception as e:
        print(f"Lỗi khi tìm kiếm: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi máy chủ nội bộ: {str(e)}")
    
@app.get("/survey/weekly-questions")
def get_weekly_survey_questions():
    """
    API này lấy một bộ câu hỏi khảo sát.
    Logic: Dựa trên tuần chẵn/lẻ để lấy 15 câu hỏi
    từ ngân hàng 30 câu.
    """
    try:
        # 1. Lấy số tuần hiện tại (từ 1 đến 52 hoặc 53)
        today = datetime.now()
        # .isocalendar().week là cách chuẩn để lấy số tuần
        week_number = today.isocalendar().week

        # 2. Xác định phạm vi (range) câu hỏi
        if week_number % 2 == 0:
            # Tuần chẵn: Lấy 15 câu đầu tiên (index 0-14)
            start_index = 0
            end_index = 14
            set_name = "Bộ A (tuần chẵn)"
        else:
            # Tuần lẻ: Lấy 15 câu tiếp theo (index 15-29)
            start_index = 15
            end_index = 29
            set_name = "Bộ B (tuần lẻ)"

        # 3. Gọi Supabase với hàm .range()
        # .order('id') là quan trọng để đảm bảo thứ tự luôn ổn định
        response = supabase.table('survey_questions') \
                           .select('*') \
                           .order('id') \
                           .range(start_index, end_index) \
                           .execute()

        data = response.data

        return {
            "message": f"Lấy bộ câu hỏi khảo sát thành công!",
            "week_number": week_number,
            "set_info": set_name,
            "data": data
        }

    except Exception as e:
        print(f"Lỗi khi lấy câu hỏi khảo sát: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi máy chủ nội bộ: {str(e)}")
    
@app.post("/survey/submit")
def submit_survey(submission: SurveySubmissionInput):
    """
    API này nhận khảo sát, lưu vào CSDL, sau đó
    gửi dữ liệu cho AI để nhận lời khuyên CÁ NHÂN HÓA.
    """
    if not submission.answers:
        raise HTTPException(status_code=400, detail="Không có câu trả lời nào để nộp.")

    try:
        # === BƯỚC A: LƯU VÀO CSDL (GIỮ NGUYÊN) ===
        records_to_insert = [
            {
                "question_id": answer.question_id,
                "response_value": answer.response_value
                # "user_id": ...
            }
            for answer in submission.answers
        ]
        supabase.table('survey_responses').insert(records_to_insert).execute()

        # === BƯỚC B: LẤY TEXT CỦA CÂU HỎI ĐỂ AI HIỂU ===
        
        # 1. Lấy danh sách ID các câu hỏi đã nộp
        question_ids = [answer.question_id for answer in submission.answers]
        
        # 2. Lấy text của các câu hỏi này từ CSDL
        q_response = supabase.table('survey_questions') \
                             .select('id, question_text') \
                             .in_('id', question_ids) \
                             .execute()
        
        # 3. Tạo một 'map' để tra cứu text từ id
        # (Ví dụ: {1: "Bạn cảm thấy vui", 2: "Bạn ngủ đủ"})
        question_text_map = {item['id']: item['question_text'] for item in q_response.data}

        # === BƯỚC C: TẠO PROMPT (LỜI NHẮC) CHO AI ===
        
        # Tạo bản tóm tắt khảo sát cho AI đọc
        survey_summary = []
        for answer in submission.answers:
            question_text = question_text_map.get(answer.question_id, "Câu hỏi không rõ")
            survey_summary.append(
                f"- Câu hỏi: '{question_text}', Mức độ: {answer.response_value}/5"
            )
        
        # Ghép lại thành 1 đoạn văn bản
        prompt_data = "\n".join(survey_summary)

        # Lời "dặn dò" (System Prompt) cho AI
        system_prompt = (
            "Bạn là một chuyên gia tâm lý học đường, tên là 'An'. "
            "Bạn luôn đồng cảm, tích cực, và không phán xét. "
            "Một học sinh vừa nộp khảo sát. Hãy nhìn vào dữ liệu và đưa ra một lời khuyên TÍCH CỰC, "
            "NGẮN GỌN (khoảng 5 câu) và TÌNH CẢM. "
            "Hãy tập trung vào những điểm cần cải thiện (điểm thấp) và động viên họ."
        )

        user_prompt = f"Đây là dữ liệu khảo sát của học sinh:\n{prompt_data}"

        # === BƯỚC D: GỌI AI ĐỂ LẤY LỜI KHUYÊN ===
        completion = client_ai.chat.completions.create(
            model="openai/gpt-oss-20b", # (gpt-4o nếu bạn muốn thông minh hơn)
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.8, # Thêm chút sáng tạo
            max_completion_tokens=4096   # Giới hạn độ dài
        )
        
        ai_advice = completion.choices[0].message.content.strip()

        return {
            "message": f"Đã nộp thành công {len(records_to_insert)} câu trả lời.",
            "positive_advice": ai_advice # Trả về lời khuyên từ AI
        }

    except Exception as e:
        print(f"[Lỗi API Khảo sát]: {e}")
        # Nếu AI lỗi, trả về lời khuyên dự phòng
        if "ai_advice" not in locals():
            return {
                "message": f"Đã nộp thành công {len(records_to_insert)} câu trả lời.",
                "positive_advice": "Cảm ơn bạn đã chia sẻ. Hãy luôn nhớ yêu thương bản thân mình nhé!"
            }
        
        raise HTTPException(status_code=500, detail=f"Lỗi máy chủ nội bộ: {str(e)}")
    
@app.post("/auth/register", response_model=Token)
def auth_register(user_in: UserCreate):
    """Tạo tài khoản người dùng mới và trả về token"""
    try:
        session = supabase.auth.sign_up({
            "email": user_in.email,
            "password": user_in.password,
        })
        
        # Nếu đăng ký thành công, Supabase tự động đăng nhập
        if not session.session or not session.session.access_token:
            raise HTTPException(status_code=400, detail="Đăng ký thất bại, không nhận được session")

        return {
            "access_token": session.session.access_token,
            "token_type": "bearer"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Email có thể đã tồn tại: {str(e)}")


@app.post("/auth/login", response_model=Token)
def auth_login(user_in: UserLogin):
    """Đăng nhập và lấy token"""
    try:
        session = supabase.auth.sign_in_with_password({
            "email": user_in.email,
            "password": user_in.password
        })
        
        if not session.session or not session.session.access_token:
            raise HTTPException(status_code=400, detail="Đăng nhập thất bại, sai thông tin")
        
        return {
            "access_token": session.session.access_token,
            "token_type": "bearer"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Đăng nhập thất bại: {str(e)}")
    
async def get_current_user(token: str = Depends(oauth2_scheme)):
    """
    Hàm Dependency:
    1. Lấy token từ header.
    2. Xác thực token với Supabase.
    3. Trả về thông tin user nếu hợp lệ.
    4. Báo lỗi 401 nếu không hợp lệ.
    """
    try:
        # Dùng token để lấy thông tin người dùng
        user_response = supabase.auth.get_user(token)
        user = user_response.user
        if not user:
            raise HTTPException(status_code=401, detail="Token không hợp lệ")
        return user
    except Exception:
        raise HTTPException(status_code=401, detail="Token không hợp lệ hoặc hết hạn")

# === PHẦN 5: API CHATBOT (API CHÍNH) ===

# Định nghĩa "bản sắc" của Chatbot
SYSTEM_PROMPT = (
    "Bạn là 'An', một chuyên gia tư vấn tâm lý và giáo dục giới tính cho học sinh THPT tại Việt Nam. "
    "Bạn phải luôn đồng cảm, kiên nhẫn, và sử dụng ngôn ngữ TÍCH CỰC, không phán xét. "
    "Bạn phải đưa ra thông tin chính xác, khoa học nhưng dễ hiểu. "
    "Nếu gặp các vấn đề nhạy cảm (tự tử, bạo hành), bạn phải khuyến khích người dùng tìm sự giúp đỡ từ người lớn tin cậy. "
    "Luôn giữ câu trả lời ngắn gọn, tập trung."
)
@app.post("/chat")
def chat_with_bot(chat_input: ChatInput):
    """
    API Chat phiên bản Guest (Không cần Token)
    Dựa vào session_id để lưu lịch sử.
    """
    try:
        user_message = chat_input.message_text
        session_id = chat_input.session_id 

        # 1. Lưu tin nhắn User (để user_id là NULL)
        supabase.table('chat_history').insert({
            "message_text": user_message,
            "sender": "user",
            "session_id": session_id, # Quan trọng: Lưu theo session_id
            "user_id": None           # Không có user_id
        }).execute()

        # 2. Lấy lịch sử chat dựa trên SESSION_ID
        history_response = supabase.table('chat_history') \
                                   .select('sender, message_text') \
                                   .eq('session_id', session_id) \
                                   .order('created_at', desc=True) \
                                   .limit(10) \
                                   .execute()
        
        # 3. Chuẩn bị context cho AI
        messages_for_ai = [{"role": "system", "content": SYSTEM_PROMPT}]
        for msg in reversed(history_response.data):
            messages_for_ai.append({
                "role": "assistant" if msg['sender'] == 'ai' else "user",
                "content": msg['message_text']
            })
        
        messages_for_ai.append({"role": "user", "content": user_message})

        # 4. Gọi Groq
        completion = client_ai.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=messages_for_ai,
            temperature=0.7,
        )
        ai_response_text = completion.choices[0].message.content.strip()

        # 5. Lưu tin nhắn AI
        supabase.table('chat_history').insert({
            "message_text": ai_response_text,
            "sender": "ai",
            "session_id": session_id,
            "user_id": None
        }).execute()

        return {"response_text": ai_response_text}

    except Exception as e:
        print(f"[Lỗi API Chat]: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi: {str(e)}")
    
# --- MODEL DỮ LIỆU CHO ADMIN ---
class TopicInput(BaseModel):
    name: str
    icon: str

class QuestionInput(BaseModel):
    topic_id: int
    question_text: str
    answer_text: str

class SurveyQuestionInput(BaseModel):
    question_text: str

# --- API QUẢN TRỊ (ADMIN) ---

# 1. Thống kê cảm xúc (Cho biểu đồ)
@app.get("/admin/stats")
def get_emotion_stats():
    """Lấy thống kê số lượng phản hồi theo mức độ 1-5"""
    try:
        # Lấy toàn bộ phản hồi từ bảng survey_responses
        response = supabase.table('survey_responses').select('response_value').execute()
        data = response.data
        
        # Đếm số lượng từng mức độ (1, 2, 3, 4, 5)
        stats = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        total = len(data)
        
        for item in data:
            val = item.get('response_value')
            if val in stats:
                stats[val] += 1
                
        return {"total": total, "breakdown": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 2. Thêm Chủ đề mới
@app.post("/admin/topics")
def create_topic(topic: TopicInput):
    try:
        supabase.table('topics').insert({"name": topic.name, "icon": topic.icon}).execute()
        return {"message": "Thêm chủ đề thành công"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 3. Xóa Chủ đề
@app.delete("/admin/topics/{topic_id}")
def delete_topic(topic_id: int):
    try:
        supabase.table('topics').delete().eq('id', topic_id).execute()
        return {"message": "Xóa chủ đề thành công"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 4. Thêm Câu hỏi Q&A
@app.post("/admin/questions")
def create_qa_question(q: QuestionInput):
    try:
        supabase.table('questions').insert({
            "topic_id": q.topic_id,
            "question_text": q.question_text,
            "answer_text": q.answer_text
        }).execute()
        return {"message": "Thêm câu hỏi thành công"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 5. Thêm Câu hỏi Khảo sát
@app.post("/admin/survey-questions")
def create_survey_question(q: SurveyQuestionInput):
    try:
        supabase.table('survey_questions').insert({"question_text": q.question_text}).execute()
        return {"message": "Thêm câu hỏi khảo sát thành công"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 6. Xóa Câu hỏi Khảo sát
@app.delete("/admin/survey-questions/{id}")
def delete_survey_question(id: int):
    try:
        supabase.table('survey_questions').delete().eq('id', id).execute()
        return {"message": "Xóa thành công"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))