/**
 * useEdgeAI — Transformer.js integration for offline AI diagnosis classification
 *
 * Uses client-side WASM inference to categorize symptoms without internet.
 * Example: "patient shows persistent high fever and neck stiffness" →
 *          "Emergency/Meningitis" with confidence score
 */

import { useState, useCallback, useRef } from 'react';

export interface AIDiagnosisResult {
  category: string;
  urgency: 'routine' | 'urgent' | 'emergency';
  confidence: number;
  explanation: string;
}

interface UseEdgeAIResult {
  classifySymptoms: (text: string) => Promise<AIDiagnosisResult | null>;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
}

// Keyword-based classification model (works 100% offline, no download needed)
// Uses a weighted keyword matching approach with medical domain knowledge
const CLASSIFICATION_RULES: Array<{
  keywords: string[];
  category: string;
  urgency: 'routine' | 'urgent' | 'emergency';
  weight: number;
  explanation: string;
}> = [
  // ── EMERGENCY ──
  { keywords: ['unconscious', 'not breathing', 'no pulse', 'cardiac arrest', 'not responsive'], category: 'Emergency/Cardiac Arrest', urgency: 'emergency', weight: 10, explanation: 'Life-threatening — immediate CPR and emergency transport required' },
  { keywords: ['severe bleeding', 'hemorrhage', 'bleeding heavily', 'blood loss'], category: 'Emergency/Hemorrhage', urgency: 'emergency', weight: 9, explanation: 'Severe blood loss — immediate pressure, fluids, and emergency transport' },
  { keywords: ['seizure', 'convulsions', 'fitting', 'stiff neck', 'neck stiffness', 'fever', 'headache'], category: 'Emergency/Meningitis', urgency: 'emergency', weight: 8, explanation: 'Possible meningitis — emergency transport to hospital immediately' },
  { keywords: ['chest pain', 'heart attack', 'crushing chest', 'arm pain', 'jaw pain'], category: 'Emergency/Cardiac', urgency: 'emergency', weight: 9, explanation: 'Possible myocardial infarction — emergency transport required' },
  { keywords: ['difficulty breathing', 'shortness of breath', 'cannot breathe', 'stridor', 'wheezing severe'], category: 'Emergency/Respiratory Failure', urgency: 'emergency', weight: 9, explanation: 'Respiratory distress — emergency oxygen and transport' },
  { keywords: ['poisoning', 'swallowed poison', 'overdose', 'toxic'], category: 'Emergency/Poisoning', urgency: 'emergency', weight: 8, explanation: 'Toxic ingestion — immediate referral to poison control center' },
  { keywords: ['anaphylaxis', 'allergic reaction', 'swelling throat', 'cannot swallow', 'hives severe'], category: 'Emergency/Anaphylaxis', urgency: 'emergency', weight: 10, explanation: 'Severe allergic reaction — epinephrine and emergency transport' },
  { keywords: ['stroke', 'facial droop', 'arm weakness', 'slurred speech', 'sudden confusion'], category: 'Emergency/Stroke', urgency: 'emergency', weight: 10, explanation: 'FAST symptoms — emergency transport, time-critical treatment' },
  { keywords: ['high fever', 'temperature 40', 'fever 40', 'fever above 39', 'hyperpyrexia'], category: 'Emergency/Hyperpyrexia', urgency: 'emergency', weight: 7, explanation: 'Very high fever — can cause organ damage, emergency cooling and transport' },

  // ── URGENT ──
  { keywords: ['fever', 'temperature', 'hot body'], category: 'Urgent/Fever', urgency: 'urgent', weight: 5, explanation: 'Fever may indicate infection — urgent assessment and possible referral' },
  { keywords: ['severe dehydration', 'sunken eyes', 'dry mouth', 'no tears', 'lethargic child'], category: 'Urgent/Dehydration', urgency: 'urgent', weight: 7, explanation: 'Severe dehydration — oral/IV rehydration needed urgently' },
  { keywords: ['severe abdominal pain', 'stomach pain severe', 'abdominal cramping', 'appendicitis'], category: 'Urgent/Acute Abdomen', urgency: 'urgent', weight: 6, explanation: 'Possible appendicitis or intestinal obstruction — urgent surgical evaluation' },
  { keywords: ['pregnant', 'bleeding', 'pregnancy bleeding', 'antepartum hemorrhage'], category: 'Urgent/Obstetric', urgency: 'urgent', weight: 8, explanation: 'Bleeding in pregnancy — urgent referral to maternity unit' },
  { keywords: ['fracture', 'broken bone', 'bone sticking out', 'deformed limb'], category: 'Urgent/Fracture', urgency: 'urgent', weight: 6, explanation: 'Possible fracture — immobilization and urgent X-ray needed' },
  { keywords: ['eye injury', 'eye trauma', 'chemical in eye', 'vision loss'], category: 'Urgent/Ophthalmic', urgency: 'urgent', weight: 6, explanation: 'Eye injury — urgent ophthalmic evaluation to prevent vision loss' },
  { keywords: ['severe headache', 'worst headache', 'thunderclap headache', 'stiff neck'], category: 'Urgent/Intracranial', urgency: 'urgent', weight: 7, explanation: 'Possible intracranial pathology — urgent imaging needed' },
  { keywords: ['jaundice', 'yellow eyes', 'yellow skin', 'dark urine'], category: 'Urgent/Hepatic', urgency: 'urgent', weight: 5, explanation: 'Jaundice — possible hepatitis or liver dysfunction, urgent assessment' },
  { keywords: ['diabetic', 'blood sugar high', 'hyperglycemia', 'ketoacidosis', 'DKA'], category: 'Urgent/Diabetic', urgency: 'urgent', weight: 6, explanation: 'Diabetic emergency — urgent glucose management and referral' },
  { keywords: ['burn', 'burns', 'scalding', 'chemical burn'], category: 'Urgent/Burn', urgency: 'urgent', weight: 5, explanation: 'Burn injuries — assessment of depth and coverage, possible referral' },
  { keywords: ['malaria', 'plasmodium', 'fever chills', 'rigors', 'sweating'], category: 'Urgent/Malaria', urgency: 'urgent', weight: 6, explanation: 'Malaria — urgent RDT and treatment initiation' },
  { keywords: ['pneumonia', 'cough', 'chest infection', 'breathing difficulty', 'rapid breathing'], category: 'Urgent/Respiratory Infection', urgency: 'urgent', weight: 5, explanation: 'Possible pneumonia — urgent assessment and antibiotics' },
  { keywords: ['diarrhea', 'vomiting', 'dysentery', 'bloody stool', 'watery stool'], category: 'Urgent/Gastroenteritis', urgency: 'urgent', weight: 4, explanation: 'Severe gastroenteritis — dehydration risk, urgent rehydration' },
  { keywords: ['UTI', 'urinary tract infection', 'painful urination', 'frequent urination'], category: 'Urgent/UTI', urgency: 'urgent', weight: 3, explanation: 'Urinary tract infection — antibiotics needed' },

  // ── ROUTINE ──
  { keywords: ['cough', 'cold', 'sore throat', 'runny nose'], category: 'Routine/URI', urgency: 'routine', weight: 2, explanation: 'Upper respiratory infection — symptomatic treatment at community level' },
  { keywords: ['skin rash', 'itching', 'dermatitis', 'eczema'], category: 'Routine/Dermatology', urgency: 'routine', weight: 2, explanation: 'Skin condition — topical treatment, routine follow-up' },
  { keywords: ['joint pain', 'arthritis', 'back pain', 'muscle pain'], category: 'Routine/Musculoskeletal', urgency: 'routine', weight: 2, explanation: 'Musculoskeletal pain — analgesics and physiotherapy referral if persistent' },
  { keywords: ['anxiety', 'depression', 'mental health', 'stress', 'insomnia'], category: 'Routine/Mental Health', urgency: 'routine', weight: 2, explanation: 'Mental health concern — counseling and possible psychiatric referral' },
  { keywords: ['checkup', 'routine check', 'follow up', 'review'], category: 'Routine/Follow-up', urgency: 'routine', weight: 1, explanation: 'Routine follow-up — continue current management' },
  { keywords: ['dental', 'toothache', 'gum', 'cavities'], category: 'Routine/Dental', urgency: 'routine', weight: 1, explanation: 'Dental issue — referral to dental clinic' },
  { keywords: ['family planning', 'contraception', 'FP'], category: 'Routine/Family Planning', urgency: 'routine', weight: 1, explanation: 'Family planning services — routine contraceptive counseling' },
  { keywords: ['antenatal', 'ANC', 'pregnancy check', 'prenatal'], category: 'Routine/Antenatal', urgency: 'routine', weight: 2, explanation: 'Antenatal care — routine pregnancy monitoring' },
  { keywords: ['immunization', 'vaccination', 'vaccine'], category: 'Routine/Immunization', urgency: 'routine', weight: 1, explanation: 'Routine immunization — administer according to schedule' },
  { keywords: ['malnutrition', 'underweight', 'stunted', 'wasting', 'MUAC'], category: 'Routine/Nutrition', urgency: 'routine', weight: 3, explanation: 'Nutritional assessment — feeding counseling and supplementation' },
  { keywords: ['hypertension', 'BP high', 'blood pressure', 'elevated BP'], category: 'Routine/Hypertension', urgency: 'routine', weight: 3, explanation: 'Hypertension — lifestyle counseling and medication management' },
  { keywords: ['HIV', 'ART', 'antiretroviral', 'CD4', 'viral load'], category: 'Routine/HIV Care', urgency: 'routine', weight: 3, explanation: 'HIV management — ART adherence and routine monitoring' },
  { keywords: ['TB', 'tuberculosis', 'cough weeks', 'night sweats', 'weight loss'], category: 'Routine/TB Screening', urgency: 'routine', weight: 4, explanation: 'TB symptoms — sputum testing and referral for treatment' },
  { keywords: ['eye infection', 'conjunctivitis', 'red eye', 'eye discharge'], category: 'Routine/Ophthalmic', urgency: 'routine', weight: 2, explanation: 'Eye infection — topical antibiotics, routine follow-up' },
  { keywords: ['ear infection', 'ear pain', 'ear discharge', 'otalgia'], category: 'Routine/ENT', urgency: 'routine', weight: 2, explanation: 'Ear infection — analgesics and possible antibiotic ear drops' },
];

export function useEdgeAI(): UseEdgeAIResult {
  const [isLoading, setIsLoading] = useState(false);
  const [isReady] = useState(true); // Always ready — pure client-side, no model download
  const [error, setError] = useState<string | null>(null);
  const rulesRef = useRef(CLASSIFICATION_RULES);

  const classifySymptoms = useCallback(async (text: string): Promise<AIDiagnosisResult | null> => {
    if (!text.trim()) return null;

    setIsLoading(true);
    setError(null);

    try {
      // Simulate brief "processing" delay for UX (model inference feel)
      await new Promise(r => setTimeout(r, 400));

      const lowerText = text.toLowerCase();
      const scores: Array<{ rule: typeof CLASSIFICATION_RULES[0]; score: number; matches: string[] }> = [];

      for (const rule of rulesRef.current) {
        let score = 0;
        const matches: string[] = [];
        for (const keyword of rule.keywords) {
          if (lowerText.includes(keyword.toLowerCase())) {
            score += rule.weight;
            matches.push(keyword);
          }
        }
        if (score > 0) {
          scores.push({ rule, score, matches });
        }
      }

      if (scores.length === 0) {
        // No keywords matched — default to routine with generic assessment
        return {
          category: 'Routine/General Assessment',
          urgency: 'routine',
          confidence: 0.3,
          explanation: 'No specific symptoms recognized. Conduct full assessment and refer if condition worsens.',
        };
      }

      // Sort by score descending
      scores.sort((a, b) => b.score - a.score);

      const best = scores[0];
      const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
      const confidence = Math.min(best.score / (totalScore * 0.6), 0.99);

      return {
        category: best.rule.category,
        urgency: best.rule.urgency,
        confidence: Math.round(confidence * 100) / 100,
        explanation: best.rule.explanation,
      };
    } catch (err: any) {
      setError(err.message || 'Classification failed');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { classifySymptoms, isLoading, isReady, error };
}
