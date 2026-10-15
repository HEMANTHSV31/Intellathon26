// English <-> Tamil translations dictionary for Diabetic Retinopathy Screening System

export const translations = {
  // Navigation & Branding
  'DR Screening': 'நீரிழிவு விழித்திரை பரிசோதனை',
  'Overview': 'கண்ணோட்டம்',
  'Clinical Reference': 'மருத்துவக் குறிப்பு',
  'Run Screening': 'விழித்திரை பரிசோதனை',
  'Capacity Model': 'திறன் மாதிரி',
  'Sign In': 'உள்நுழைக',
  'Sign Up': 'பதிவு செய்க',
  'Sign Out': 'வெளியேறு',

  // Common UI & Actions
  'Select Language': 'மொழியைத் தேர்ந்தெடுக்கவும்',
  'English': 'English',
  'Tamil': 'தமிழ்',
  'Upload a fundus image': 'விழித்திரை படத்தை பதிவேற்றவும்',
  'Run screening pipeline': 'பரிசோதனையைத் தொடங்கவும்',
  'Print report': 'அறிக்கையை அச்சிடுக',
  'Step 1': 'படி 1',
  'Step 2': 'படி 2',
  'Step 3': 'படி 3',
  'Summary': 'சுருக்கம்',
  'Loading classifier model…': 'வகைப்படுத்தி மாதிரி ஏற்றப்படுகிறது…',
  'Classifier model loaded': 'வகைப்படுத்தி மாதிரி வெற்றிகரமாக ஏற்றப்பட்டது',
  'Ask an ophthalmologist': 'கண் மருத்துவரிடம் பரிந்துரைக்கவும்',
  'Images are downsampled to a maximum of 800px on the longest side before processing, for speed. Nothing is uploaded anywhere — all computation runs in this browser tab.':
    'படங்கள் விரைவான செயலாக்கத்திற்காக 800 பிக்சல்களாக குறைக்கப்படுகின்றன. எந்தப் படமும் பதிவேற்றப்படவில்லை — அனைத்தும் இந்த உலாவியிலேயே இயங்குகின்றன.',

  // Screening Pipeline
  'Image quality assessment & enhancement': 'படத்தின் தர மதிப்பீடு மற்றும் மேம்பாடு',
  'As uploaded (resized for processing)': 'பதிவேற்றப்பட்டது போல (செயலாக்கத்திற்கு மாற்றப்பட்டது)',
  'After enhancement (if applied)': 'மேம்படுத்தப்பட்ட பிறகு',
  'Focus, brightness and field-of-view are computed directly from pixel data (Laplacian-variance focus measure, greyscale histogram mean/spread, non-black pixel fraction). Thresholds below are prototype heuristics for this build, not clinically validated cutoffs.':
    'கவனம், பிரகாசம் மற்றும் பார்வைக் களம் ஆகியவை நேரடியாக பிக்சல் தரவிலிருந்து கணக்கிடப்படுகின்றன.',
  'DR classification': 'நீரிழிவு விழித்திரை வகைப்பாடு',
  'Anatomical landmarks & lesion detection': 'கண் உடற்கூறியல் மற்றும் புண்கள் கண்டறிதல்',
  'Screening report': 'பரிசோதனை அறிக்கை',
  'Referral verdict': 'பரிந்துரை முடிவு',
  'Model confidence': 'மாதிரி நம்பிக்கை',
  'Grad-CAM attention heatmap': 'Grad-CAM வெப்ப வரைபடம்',
  'Candidate lesion markers': 'கண்டறியப்பட்ட புண்கள்',

  // Severity Grades
  'No DR': 'DR இல்லை (சாதாரணமானது)',
  'DR present': 'DR கண்டறியப்பட்டது',
  'Clear': 'தெளிவானது (பாதிப்பு இல்லை)',
  'Refer': 'கண் மருத்துவரிடம் பரிந்துரைக்கவும்',
  'Escalate': 'மனித மருத்துவருக்கு தீவிரப்படுத்தவும்',
  'Mild NPDR': 'லேசான NPDR',
  'Moderate NPDR': 'மிதமான NPDR',
  'Severe NPDR': 'கடுமையான NPDR',
  'Proliferative DR': 'தீவிர விழித்திரை நோய் (PDR)',

  // Lesion Names
  'Microaneurysms': 'மைக்ரோஅன்யூரிஸம்கள் (இரத்தக்குழாய் வீக்கம்)',
  'Haemorrhages': 'இரத்தக் கசிவுகள்',
  'Hard Exudates': 'கடினமான கசிவுகள் (கொழுப்பு படிவுகள்)',
  'Soft Exudates': 'மென்மையான கசிவுகள் (பருத்தி புள்ளிகள்)',
  'Optic Disc': 'பார்வை வட்டு',
  'Fovea': 'மத்திய பார்வை புள்ளி (ஃபோவியா)',
  'Blood Vessels': 'இரத்த நாளங்கள்',

  // Login & Auth
  'Welcome Back': 'மீண்டும் வருக',
  'Sign in to access your screening workspace': 'பரிசோதனைப் பணியிடத்தை அணுக உள்நுழைக',
  'Create Account': 'கணக்கை உருவாக்கவும்',
  'Sign up for clinical DR screening access': 'மருத்துவ விழித்திரை பரிசோதனைக்கு பதிவு செய்யவும்',
  'Email Address': 'மின்னஞ்சல் முகவரி',
  'Password': 'கடவுச்சொல்',
  'Full Name': 'முழு பெயர்',
  'Full name': 'முழு பெயர்',
  'Remember me for 7 days': '7 நாட்களுக்கு நினைவில் கொள்க',
  "Don't have an account?": 'கணக்கு இல்லையா?',
  'Already have an account?': 'ஏற்கனவே கணக்கு உள்ளதா?',
  'Password must be at least 6 characters': 'கடவுச்சொல் குறைந்தது 6 எழுத்துகள் இருக்க வேண்டும்',

  // Overview Page
  'Diabetic Retinopathy Screening — SIH26038': 'நீரிழிவு விழித்திரை பரிசோதனை திட்டம்',
  'A browser-based screening, explainability and capacity-planning pipeline for retinal fundus photographs.':
    'விழித்திரை புகைப்படங்களுக்கான உலாவி அடிப்படையிலான பரிசோதனை மற்றும் விளக்க அமைப்பு.',
  'Everything runs client-side. No image is uploaded anywhere, and there is no backend.':
    'அனைத்தும் உங்கள் கணினியிலேயே இயங்குகின்றன. எந்தப் படமும் சேமிக்கப்படுவதில்லை.',

  // Capacity Planning
  'District Capacity Model': 'மாவட்ட சுகாதார திறன் மாதிரி',
  'Primary Health Centre (PHC)': 'ஆரம்ப சுகாதார நிலையம் (PHC)',
  'Screening capacity': 'பரிசோதனை திறன்',
  'Ophthalmologist referral load': 'கண் மருத்துவர் பரிந்துரை சுமை'
}

// Helper to translate single key or return fallback
export function translateText(text, targetLang = 'en') {
  if (!text || targetLang === 'en') return text
  const trimmed = text.trim()
  if (translations[trimmed]) return translations[trimmed]
  return text
}
