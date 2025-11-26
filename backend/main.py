import os
from fastapi import FastAPI, HTTPException, Path, Query, Depends
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime
from pydantic import BaseModel, Field, EmailStr
import random # <--- THÊM CÁI NÀY
from typing import List, Optional # <--- CẬP NHẬT DÒNG NÀY (thêm Optional)
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
@app.get("/debug/check-data")
def debug_check_data():
    res_users = supabase.table('survey_submissions').select('*').execute()
    res_answers = supabase.table('survey_responses').select('*').execute()
    return {
        "users": res_users.data,
        "answers": res_answers.data
    }

    
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

# ==========================================
# 1. CÁC MODEL DỮ LIỆU (PYDANTIC)
# ==========================================

class SurveyAnswerInput(BaseModel):
    question_id: int
    response_value: int

class SurveySubmissionInput(BaseModel):
    full_name: str
    age: int
    gender: str
    daily_note: Optional[str] = ""
    answers: List[SurveyAnswerInput]

# ==========================================
# 2. API NỘP BÀI KHẢO SÁT
# ==========================================

@app.post("/survey/submit")
def submit_survey(submission: SurveySubmissionInput):
    """
    Quy trình:
    1. Nhận thông tin Tên, Tuổi, Giới tính -> Lưu vào bảng 'survey_submissions'.
    2. Lấy ID của bản ghi vừa tạo.
    3. Lưu danh sách câu trả lời kèm ID đó vào bảng 'survey_responses'.
    4. Tính điểm trung bình để AI hiểu tâm trạng.
    5. Gọi Groq AI để xin lời khuyên.
    """
    
    # Debug: In ra terminal để kiểm tra dữ liệu gửi lên
    print(f"⬇️ DATA NHẬN: Tên={submission.full_name}, Tuổi={submission.age}, Số câu trả lời={len(submission.answers)}")

    if not submission.answers:
        raise HTTPException(status_code=400, detail="Không có câu trả lời nào được gửi.")

    try:
        # --- BƯỚC 1: LƯU THÔNG TIN NGƯỜI DÙNG ---
        user_data = {
            "full_name": submission.full_name,
            "age": submission.age,
            "gender": submission.gender,
            "daily_note": submission.daily_note
        }
        
        # Insert vào Supabase và lấy về dữ liệu vừa tạo
        user_res = supabase.table('survey_submissions').insert(user_data).execute()
        
        # Kiểm tra xem có lưu được không
        if not user_res.data:
            raise HTTPException(status_code=500, detail="Lỗi CSDL: Không lưu được thông tin người dùng (Kiểm tra RLS Policy).")
            
        submission_id = user_res.data[0]['id']
        print(f"✅ Đã tạo Submission ID: {submission_id}")

        # --- BƯỚC 2: LƯU CÂU TRẢ LỜI ---
        records_to_insert = []
        total_score = 0
        
        for answer in submission.answers:
            records_to_insert.append({
                "question_id": answer.question_id,
                "response_value": answer.response_value,
                "submission_id": submission_id # Liên kết với ID người dùng vừa tạo
            })
            total_score += answer.response_value

        # Thực hiện lưu hàng loạt
        supabase.table('survey_responses').insert(records_to_insert).execute()
        print(f"✅ Đã lưu {len(records_to_insert)} câu trả lời.")

        # --- BƯỚC 3: TÍNH ĐIỂM TRUNG BÌNH ---
        avg_score = total_score / len(submission.answers)
        print(f"📊 Điểm trung bình: {avg_score:.2f}")

        # --- BƯỚC 4: CHUẨN BỊ PROMPT CHO AI ---
        # Tạo bối cảnh cho AI hiểu
        mood_description = ""
        if avg_score <= 2:
            mood_description = "đang cảm thấy rất tệ, buồn chán hoặc áp lực nặng nề."
        elif avg_score <= 3.5:
            mood_description = "đang cảm thấy bình thường, hơi mệt mỏi hoặc chông chênh một chút."
        else:
            mood_description = "đang có tinh thần rất tốt, vui vẻ và tích cực."

        system_prompt = (
            """Your name is Zizi. You are a School Psychology Companion, an expert in adolescent mental health and sex-education counseling. Your role is to support secondary-school students by listening empathetically, understanding their emotions deeply, and responding in a friendly, teen-like tone while maintaining professionalism and safety.
                Behavior Requirements:
                1. All outputs must be written in Vietnamese.
                2. Respond concisely in 3–4 sentences.
                3. Use a friendly, youthful, peer-like voice, but keep all explanations accurate, respectful, and developmentally appropriate.
                4. Demonstrate strong emotional understanding: reflect the student’s feelings, clarify their concerns, and validate their experience.
                5. Provide specific, actionable micro-tasks (e.g., small steps, reflections, coping actions) when the student is stressed, confused, or hurt.
                6. Provide gentle encouragement or reinforcement when the student shares something positive or feels happy.
                7. Offer guidance consistent with the best practices of school psychology and age-appropriate sex education.
                8. Avoid judgment, avoid medical diagnoses, and avoid harmful or explicit content.
                9. Always prioritize student safety, well-being, and appropriate boundaries.
                Communication Style:
                1. Warm, caring, youth-friendly, and clear.
                2. Avoid slang that may be rude or ambiguous.
                3. Keep tone supportive and empowering.
                """
        )
        user_prompt = (
            f"Học sinh tên là {submission.full_name}, {submission.age} tuổi, giới tính {submission.gender}. "
            f"Kết quả khảo sát tâm lý cho thấy điểm trung bình là {avg_score:.1f}/5. "
            f"Điều này có nghĩa là bạn ấy {mood_description} "
            f"ĐẶC BIỆT, bạn ấy có tâm sự thêm: {submission.daily_note}. "
            f"Hãy gọi tên bạn ấy và đưa ra lời khuyên hoặc lời động viên phù hợp nhất ngay lúc này."
        )

        # --- BƯỚC 5: GỌI GROQ AI ---
        completion = client_ai.chat.completions.create(
            model="llama-3.1-8b-instant", # Sử dụng Model mới nhất
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7, # Độ sáng tạo vừa phải
            max_tokens=200   # Giới hạn độ dài câu trả lời
        )
        
        ai_advice = completion.choices[0].message.content.strip()
        print(f"🤖 AI trả lời: {ai_advice}")

        # --- BƯỚC 6: TRẢ VỀ KẾT QUẢ ---
        return {
            "message": "Nộp khảo sát thành công",
            "submission_id": submission_id,
            "average_score": avg_score,
            "positive_advice": ai_advice
        }

    except Exception as e:
        print(f"❌ LỖI API SUBMIT: {str(e)}")
        # Trả về lỗi chi tiết để Frontend biết đường xử lý
        raise HTTPException(status_code=500, detail=f"Lỗi Server: {str(e)}")
    
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
    topic_id: int = Path(..., title="ID của Chủ đề", ge=1)):
    """
    API này lấy 10 câu hỏi NGẪU NHIÊN thuộc một chủ đề cụ thể.
    Nó gọi hàm 'get_random_questions' mà chúng ta đã tạo trong Supabase.
    """
    try:
        # Đây là lúc gọi "tuyệt chiêu" (SQL Function)
        # 'rpc' là viết tắt của 'Remote Procedure Call'
        response = supabase.rpc(
            'get_random_questions',           # Tên hàm SQL
            {'p_topic_id': topic_id}).execute()          # Tham số truyền vào hàm
        

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
    Lấy danh sách câu hỏi:
    - Vẫn theo logic Tuần Chẵn/Lẻ (để đổi gió theo tuần).
    - Nhưng chỉ lấy NGẪU NHIÊN 5 câu trong bộ đó.
    """
    try:
        # 1. Xác định tuần hiện tại
        week_number = datetime.now().isocalendar()[1]
        
        # 2. Lấy toàn bộ câu hỏi (hoặc lọc theo tuần như cũ)
        if week_number % 2 == 0:
            # Tuần chẵn: Lấy từ ID 0-14 (Ví dụ)
            response = supabase.table('survey_questions').select('*').range(0, 14).execute()
        else:
            # Tuần lẻ: Lấy từ ID 15-29
            response = supabase.table('survey_questions').select('*').range(15, 29).execute()
            
        all_questions = response.data
        
        # 3. LOGIC NGẪU NHIÊN: Chọn 5 câu bất kỳ
        # Nếu kho câu hỏi ít hơn 5 câu thì lấy hết, ngược lại thì random 5 câu
        if len(all_questions) > 5:
            selected_questions = random.sample(all_questions, 5)
        else:
            selected_questions = all_questions
            
        return {"data": selected_questions}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    

    
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
        """Your name is Zizi. You are a School Psychology Companion, an expert in adolescent mental health and sex-education counseling. Your role is to support secondary-school students by listening empathetically, understanding their emotions deeply, and responding in a friendly, teen-like tone while maintaining professionalism and safety.
                Behavior Requirements:
                1. All outputs must be written in Vietnamese.
                2. Respond concisely in 3–4 sentences.
                3. Use a friendly, youthful, peer-like voice, but keep all explanations accurate, respectful, and developmentally appropriate.
                4. Demonstrate strong emotional understanding: reflect the student’s feelings, clarify their concerns, and validate their experience.
                5. Provide specific, actionable micro-tasks (e.g., small steps, reflections, coping actions) when the student is stressed, confused, or hurt.
                6. Provide gentle encouragement or reinforcement when the student shares something positive or feels happy.
                7. Offer guidance consistent with the best practices of school psychology and age-appropriate sex education.
                8. Avoid judgment, avoid medical diagnoses, and avoid harmful or explicit content.
                9. Always prioritize student safety, well-being, and appropriate boundaries.
                Communication Style:
                1. Warm, caring, youth-friendly, and clear.
                2. Avoid slang that may be rude or ambiguous.
                3. Keep tone supportive and empowering.
            """)
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
    answer_yes: str  # <--- Mới
    answer_no: str   # <--- Mới

class SurveyQuestionInput(BaseModel):
    question_text: str

# --- API QUẢN TRỊ (ADMIN) ---
class QAResponseInput(BaseModel):
    question_id: int
    user_thought: str
    session_id: str
    
@app.post("/qa/submit-thought")
def submit_qa_thought(data: QAResponseInput):
    try:
        supabase.table('user_qa_responses').insert({
            "question_id": data.question_id,
            "user_thought": data.user_thought,
            "session_id": data.session_id
        }).execute()
        return {"message": "Đã lưu ý kiến"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
# 1. Thống kê cảm xúc (Cho biểu đồ)
@app.get("/admin/stats")
def get_emotion_stats():
    """
    Thống kê cảm xúc (Phiên bản Vòng lặp - Tải không giới hạn)
    """
    try:
        all_data = []       # Nơi chứa toàn bộ dữ liệu gom được
        current_start = 0   # Điểm bắt đầu
        batch_size = 1000   # Kích thước mỗi lần tải (Max của Supabase)
        
        print("\n⏳ Bắt đầu tải dữ liệu phân trang...")

        while True:
            # Tải từng lô 1000 dòng
            response = supabase.table('survey_responses') \
                               .select('submission_id, response_value') \
                               .order('id', desc=True) \
                               .range(current_start, current_start + batch_size - 1) \
                               .execute()
            
            batch = response.data
            all_data.extend(batch) # Gộp lô vừa tải vào danh sách chung
            
            print(f"   + Đã tải lô từ dòng {current_start} -> {current_start + len(batch)}")
            
            # Nếu lô này lấy về ít hơn 1000 dòng, nghĩa là đã hết dữ liệu trong kho -> Dừng
            if len(batch) < batch_size:
                break
            
            # Nếu chưa hết, tăng điểm bắt đầu lên để tải lô tiếp theo
            current_start += batch_size

        print(f"📊 TỔNG KẾT: Đã tải thành công {len(all_data)} dòng dữ liệu!")
        
        # --- PHẦN XỬ LÝ LOGIC (Giữ nguyên, chỉ đổi biến data thành all_data) ---
        user_scores = {}
        old_data_count = 0 

        for item in all_data: # <--- Chú ý: Dùng all_data ở đây
            sub_id = item.get('submission_id')
            val = item.get('response_value')
            
            if sub_id:
                # Dữ liệu MỚI (Có ID)
                key = str(sub_id)
                if key not in user_scores:
                    user_scores[key] = []
                user_scores[key].append(val)
            else:
                # Dữ liệu CŨ (Không ID)
                fake_user_index = old_data_count // 5
                fake_id = f"anon_group_{fake_user_index}"
                
                if fake_id not in user_scores:
                    user_scores[fake_id] = []
                user_scores[fake_id].append(val)
                
                old_data_count += 1
        
        # Tính toán thống kê
        stats = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        total_people = len(user_scores)

        for uid, scores in user_scores.items():
            if scores:
                avg = sum(scores) / len(scores)
                rounded_avg = round(avg)
                if rounded_avg < 1: rounded_avg = 1
                if rounded_avg > 5: rounded_avg = 5
                stats[rounded_avg] += 1
                
        return {"total": total_people, "breakdown": stats}

    except Exception as e:
        print(f"Lỗi thống kê: {e}")
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
            "answer_yes": q.answer_yes, # <--- Lưu đáp án Có
            "answer_no": q.answer_no    # <--- Lưu đáp án Không
        }).execute()
        return {"message": "Thêm câu hỏi rẽ nhánh thành công"}
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
    
