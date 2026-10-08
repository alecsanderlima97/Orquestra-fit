"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Activity, ArrowLeft, BookOpen, Dumbbell, RefreshCw, RotateCcw, Timer, Weight, ZoomIn, ZoomOut } from "lucide-react";

export type ExerciseAnatomyData = { name: string; primaryMuscle: string; secondaryMuscles?: string; anatomyProfile?: "masculino" | "feminino"; sets: number; reps: string; load: string; metricMode?: "strength" | "cardio" | "timed"; rest: string; };
type MuscleZone = "frontShoulders" | "rearShoulders" | "chest" | "biceps" | "triceps" | "forearms" | "upperBack" | "lats" | "lowerBack" | "abs" | "obliques" | "glutes" | "quads" | "hamstrings" | "calves";
type AnatomyView = "front" | "side" | "back";
const VIEW_ORDER: AnatomyView[] = ["front", "side", "back"];
const VIEW_LABEL: Record<AnatomyView, string> = { front: "Frente", side: "Lado", back: "Costas" };

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function muscleZones(value: string, exerciseName = ""): Set<MuscleZone> {
  const text = normalize(`${value} ${exerciseName}`); const zones = new Set<MuscleZone>();
  const rearShoulder = /ombro posterior|deltoide posterior|crucifixo inverso|reverse fly|face pull/.test(text);
  const posteriorChain = !/ombro posterior|deltoide posterior/.test(text) && /posteriores?(?: da coxa)?|flexora|stiff|levantamento terra|good morning|mesa flexora/.test(text);
  const frontLeg = /quadriceps|agachamento|leg press|extensora|afundo|passada|step.up|cadeira extensora/.test(text);
  if (/peito|peitoral|supino|crucifixo(?! inverso)|chest press/.test(text)) zones.add("chest");
  if (/biceps|rosca/.test(text)) zones.add("biceps");
  if (/triceps|testa|mergulho/.test(text)) zones.add("triceps");
  if (/antebraco|punho/.test(text)) zones.add("forearms");
  if (rearShoulder) zones.add("rearShoulders");
  else if (/ombro|deltoide|elevacao lateral|elevacao frontal|desenvolvimento/.test(text)) zones.add("frontShoulders");
  if (/trapezio|encolhimento|shrug/.test(text)) zones.add("upperBack");
  if (/costas|dorsal|dorsai|remada|puxada|pulldown|graviton|barra assistida|barra fixa|dominada|pull.up|chin.up/.test(text)) zones.add("lats");
  if (/lombar|hiperextensao|extensao lombar/.test(text)) zones.add("lowerBack");
  if (/obliquo|lateral|rotacao|twist|side bend/.test(text)) zones.add("obliques");
  if (/abdomen|abdominal|core|central|prancha/.test(text)) zones.add("abs");
  if (/gluteo|quadril|elevacao pelvica|hip thrust/.test(text)) zones.add("glutes");
  if (frontLeg || /coxa|adutor|perna/.test(text) && !posteriorChain) zones.add("quads");
  if (posteriorChain) zones.add("hamstrings");
  if (/panturrilha/.test(text)) zones.add("calves");
  if (/braco/.test(text) && !zones.has("biceps") && !zones.has("triceps")) { zones.add("biceps"); zones.add("triceps"); }
  return zones;
}

function recommendedView(zones: Set<MuscleZone>): AnatomyView {
  if (["rearShoulders", "triceps", "upperBack", "lats", "lowerBack", "glutes", "hamstrings"].some((zone) => zones.has(zone as MuscleZone))) return "back";
  if (zones.has("obliques")) return "side";
  return "front";
}

const FRONT_PATHS: Record<MuscleZone, string[]> = {
  frontShoulders: ["M110 99 C92 102 82 116 83 140 C89 150 99 151 109 143 L124 111 C121 104 116 100 110 99 Z", "M210 99 C228 102 238 116 237 140 C231 150 221 151 211 143 L196 111 C199 104 204 100 210 99 Z"],
  rearShoulders: [],
  chest: ["M126 107 C136 100 149 100 157 107 L157 154 C143 159 128 154 117 143 L113 121 C116 114 120 110 126 107 Z", "M194 107 C184 100 171 100 163 107 L163 154 C177 159 192 154 203 143 L207 121 C204 114 200 110 194 107 Z"],
  biceps: ["M91 137 C79 146 73 166 76 188 C82 195 90 193 98 185 L108 149 C104 140 99 136 91 137 Z", "M229 137 C241 146 247 166 244 188 C238 195 230 193 222 185 L212 149 C216 140 221 136 229 137 Z"],
  triceps: [],
  forearms: ["M75 188 C65 199 56 224 51 254 C55 261 62 263 70 258 L87 207 C86 197 82 191 75 188 Z", "M245 188 C255 199 264 224 269 254 C265 261 258 263 250 258 L233 207 C234 197 238 191 245 188 Z"],
  upperBack: [], lats: [], lowerBack: [],
  abs: ["M137 154 C144 158 151 159 157 157 L157 252 L139 249 C130 222 128 185 137 154 Z", "M183 154 C176 158 169 159 163 157 L163 252 L181 249 C190 222 192 185 183 154 Z"],
  obliques: ["M119 162 C108 175 108 212 122 234 L135 223 L133 174 Z", "M201 162 C212 175 212 212 198 234 L185 223 L187 174 Z"],
  glutes: [],
  quads: ["M123 246 C133 239 144 241 151 251 L148 340 C143 354 135 359 124 352 C116 324 115 273 123 246 Z", "M197 246 C187 239 176 241 169 251 L172 340 C177 354 185 359 196 352 C204 324 205 273 197 246 Z"],
  hamstrings: [],
  calves: ["M123 382 C113 401 112 454 121 493 C127 501 134 498 138 488 L145 399 C139 386 132 380 123 382 Z", "M197 382 C207 401 208 454 199 493 C193 501 186 498 182 488 L175 399 C181 386 188 380 197 382 Z"],
};
const SIDE_PATHS: Record<MuscleZone, string[]> = {
  frontShoulders: ["M145 91 C160 88 174 99 177 118 C174 135 164 144 151 140 C142 130 138 105 145 91 Z"],
  rearShoulders: ["M140 94 C147 89 155 91 161 103 L159 140 C151 142 144 136 140 126 C136 113 136 102 140 94 Z"],
  chest: ["M174 102 C189 108 195 123 191 143 C185 152 176 153 166 146 L158 119 C162 109 167 104 174 102 Z"],
  biceps: ["M151 132 C164 137 169 157 165 174 C160 182 153 180 147 171 L141 149 C142 141 145 135 151 132 Z"],
  triceps: ["M143 132 C151 136 157 151 156 177 C151 187 145 185 140 176 L136 149 C137 140 139 135 143 132 Z"],
  forearms: ["M157 184 C166 204 170 232 167 257 C161 266 154 263 150 253 L143 205 C146 194 150 188 157 184 Z"],
  upperBack: ["M136 78 C126 93 126 124 136 145 L151 137 L153 103 C149 89 144 81 136 78 Z"],
  lats: ["M136 135 C124 157 125 191 137 213 L151 207 L153 149 C148 140 142 136 136 135 Z"],
  lowerBack: ["M140 196 C132 207 132 229 140 244 L153 238 L154 207 C150 199 145 196 140 196 Z"],
  abs: ["M163 143 C176 157 180 195 173 228 L158 229 L148 178 C150 158 155 147 163 143 Z"],
  obliques: ["M151 152 C139 167 138 201 148 225 L159 222 L164 166 C160 156 156 152 151 152 Z"],
  glutes: ["M133 220 C119 230 115 257 126 283 C136 294 149 290 157 275 L155 235 C149 225 142 220 133 220 Z"],
  quads: ["M147 276 C139 286 136 320 142 351 C147 362 154 361 159 352 L162 294 C158 282 153 276 147 276 Z"],
  hamstrings: ["M135 278 C125 291 123 325 131 354 C137 365 145 365 151 355 L154 293 C149 282 142 276 135 278 Z"],
  calves: ["M133 371 C122 393 123 449 134 489 C140 498 147 495 150 482 L154 391 C149 379 142 372 133 371 Z"],
};
const BACK_PATHS: Record<MuscleZone, string[]> = {
  frontShoulders: ["M112 102 C94 107 86 122 88 144 C94 151 104 149 112 141 L126 112 C122 106 118 103 112 102 Z", "M208 102 C226 107 234 122 232 144 C226 151 216 149 208 141 L194 112 C198 106 202 103 208 102 Z"],
  rearShoulders: ["M112 102 C94 107 86 122 88 144 C94 151 104 149 112 141 L126 112 C122 106 118 103 112 102 Z", "M208 102 C226 107 234 122 232 144 C226 151 216 149 208 141 L194 112 C198 106 202 103 208 102 Z"],
  chest: [], biceps: [],
  triceps: ["M92 139 C80 148 75 168 79 188 C84 194 91 191 98 184 L108 151 C104 142 99 138 92 139 Z", "M228 139 C240 148 245 168 241 188 C236 194 229 191 222 184 L212 151 C216 142 221 138 228 139 Z"],
  forearms: ["M78 186 C67 200 61 225 61 251 C66 258 73 257 79 250 L91 204 C89 195 85 189 78 186 Z", "M242 186 C253 200 259 225 259 251 C254 258 247 257 241 250 L229 204 C231 195 235 189 242 186 Z"],
  upperBack: ["M124 105 C136 94 150 96 158 108 L157 154 L132 158 C119 144 117 117 124 105 Z", "M196 105 C184 94 170 96 162 108 L163 154 L188 158 C201 144 203 117 196 105 Z"],
  lats: ["M127 148 C112 166 114 204 132 229 L156 222 L157 159 C146 151 136 147 127 148 Z", "M193 148 C208 166 206 204 188 229 L164 222 L163 159 C174 151 184 147 193 148 Z"],
  lowerBack: ["M139 207 C130 220 130 244 140 261 L157 254 L157 214 C151 208 145 206 139 207 Z", "M181 207 C190 220 190 244 180 261 L163 254 L163 214 C169 208 175 206 181 207 Z"],
  abs: [],
  obliques: ["M124 188 C114 205 118 230 132 245 L143 234 L140 195 Z", "M196 188 C206 205 202 230 188 245 L177 234 L180 195 Z"],
  glutes: ["M126 229 C139 219 152 225 158 243 L152 282 C137 289 122 280 118 261 Z", "M194 229 C181 219 168 225 162 243 L168 282 C183 289 198 280 202 261 Z"],
  quads: [],
  hamstrings: ["M124 277 C114 295 116 334 126 356 C135 362 144 356 148 344 L151 289 C144 278 134 274 124 277 Z", "M196 277 C206 295 204 334 194 356 C185 362 176 356 172 344 L169 289 C176 278 186 274 196 277 Z"],
  calves: ["M123 382 C113 401 112 454 121 493 C127 501 134 498 138 488 L145 399 C139 386 132 380 123 382 Z", "M197 382 C207 401 208 454 199 493 C193 501 186 498 182 488 L175 399 C181 386 188 380 197 382 Z"],
};

type MuscleInsight = { label: string; function: string; activation: string; recovery: string; development: string; };
type Callout = { target: [number, number]; elbow: [number, number]; label: [number, number]; align: "start" | "end"; };

const MUSCLE_INSIGHTS: Record<MuscleZone, MuscleInsight> = {
  frontShoulders: { label: "Deltoides", function: "As porções anterior e lateral elevam o braço; a anterior também participa da flexão e das empurradas.", activation: "Mantenha a escápula estável e suba até a amplitude confortável, sem levar os ombros às orelhas.", recovery: "Após treino de força, em geral pedem 48–72 h antes de uma nova sessão intensa.", development: "O contorno aparece com progressão de carga, técnica consistente, descanso e composição corporal." },
  rearShoulders: { label: "Deltoide posterior", function: "Leva o braço para trás e ajuda a controlar a posição da cabeça do úmero na articulação do ombro.", activation: "Trabalha melhor com o peito firme, cotovelos abrindo e pouca compensação do trapézio.", recovery: "Após treino de força, em geral pede 48–72 h antes de uma nova sessão intensa.", development: "O contorno aparece com progressão de carga, técnica consistente, descanso e composição corporal." },
  chest: { label: "Peitoral maior", function: "Suas porções clavicular e esternocostal aproximam o braço do tronco e participam da flexão e rotação interna do ombro.", activation: "No supino e crucifixo, aproxime os braços sem perder a posição das escápulas nem deixar o ombro avançar.", recovery: "Após treino de força, em geral pede 48–72 h antes de uma nova sessão intensa.", development: "O contorno aparece com progressão de carga, técnica consistente, descanso e composição corporal." },
  biceps: { label: "Bíceps braquial", function: "As cabeças longa e curta flexionam o cotovelo; com a palma virada para cima, também ajudam na supinação do antebraço.", activation: "Evite embalo do tronco, mantenha o cotovelo próximo ao corpo e complete o arco com controle.", recovery: "Após treino de força, em geral pede 48–72 h antes de uma nova sessão intensa.", development: "O contorno aparece com progressão de carga, técnica consistente, descanso e composição corporal." },
  triceps: { label: "Tríceps braquial", function: "As três cabeças estendem o cotovelo; a cabeça longa também cruza o ombro e auxilia na extensão do braço.", activation: "Mantenha o cotovelo estável e estenda o braço sem projetar o ombro para frente.", recovery: "Após treino de força, em geral pede 48–72 h antes de uma nova sessão intensa.", development: "O contorno aparece com progressão de carga, técnica consistente, descanso e composição corporal." },
  forearms: { label: "Antebraços", function: "Controlam punho e pegada durante puxadas, roscas e cargas livres.", activation: "Use uma pegada firme, porém sem travar o punho em posição desconfortável.", recovery: "Costumam recuperar rápido, mas o volume de pegada acumulado também conta.", development: "O contorno aparece com progressão de carga, técnica consistente, descanso e composição corporal." },
  upperBack: { label: "Trapézio", function: "As fibras superiores elevam, as médias retraem e as inferiores deprimem a escápula, ajudando a posicionar o ombro.", activation: "Coordene a escápula com o braço, sem projetar a cabeça à frente ou transformar toda puxada em encolhimento.", recovery: "Após treino de força, em geral pede 48–72 h antes de uma nova sessão intensa.", development: "O contorno aparece com progressão de carga, técnica consistente, descanso e composição corporal." },
  lats: { label: "Grande dorsal", function: "É um músculo amplo das costas que aduz, estende e gira o braço para dentro, contribuindo para a largura do tronco.", activation: "Inicie a puxada com a escápula e conduza os cotovelos em direção ao quadril, sem usar o impulso do corpo.", recovery: "Após treino de força, em geral pede 48–72 h antes de uma nova sessão intensa.", development: "O contorno aparece com progressão de carga, técnica consistente, descanso e composição corporal." },
  lowerBack: { label: "Lombar", function: "Os eretores da coluna mantêm o tronco estendido e resistem à flexão enquanto o quadril se move.", activation: "Priorize coluna neutra e pressão abdominal; não busque amplitude além da técnica.", recovery: "A recuperação varia com a carga total; ajuste o próximo treino com o professor se houver fadiga persistente.", development: "O contorno aparece com progressão de carga, técnica consistente, descanso e composição corporal." },
  abs: { label: "Reto abdominal", function: "Controla a flexão do tronco e protege a estabilidade do centro do corpo.", activation: "Expire ao contrair e mantenha a lombar sob controle, sem puxar o pescoço.", recovery: "Após treino de força, em geral pede 24–48 h antes de outra sessão intensa.", development: "A definição também depende de composição corporal; não há prazo fixo para ela aparecer." },
  obliques: { label: "Oblíquos", function: "Controlam rotação e inclinação lateral do tronco.", activation: "Movimente o tronco com controle e evite ganhar velocidade usando o quadril.", recovery: "Após treino de força, em geral pede 24–48 h antes de outra sessão intensa.", development: "A definição também depende de composição corporal; não há prazo fixo para ela aparecer." },
  glutes: { label: "Glúteo máximo", function: "É o principal extensor e rotador lateral do quadril; o glúteo médio também ajuda a estabilizar a pelve.", activation: "Mantenha joelho e pé alinhados e termine a extensão do quadril sem hiperestender a lombar.", recovery: "Após treino de força, em geral pedem 48–72 h antes de uma nova sessão intensa.", development: "O contorno aparece com progressão de carga, técnica consistente, descanso e composição corporal." },
  quads: { label: "Quadríceps", function: "Os quatro músculos da frente da coxa estendem o joelho e controlam a descida em agachamentos e subidas.", activation: "Controle joelhos e pés na mesma direção durante todo o movimento, mantendo o apoio do pé.", recovery: "Após treino de força, em geral pedem 48–72 h antes de uma nova sessão intensa.", development: "O contorno aparece com progressão de carga, técnica consistente, descanso e composição corporal." },
  hamstrings: { label: "Posteriores da coxa", function: "Bíceps femoral, semitendíneo e semimembranáceo flexionam o joelho e ajudam a estender o quadril.", activation: "Mantenha o quadril estável e controle a fase de retorno, especialmente no alongamento sob carga.", recovery: "Após treino de força, em geral pedem 48–72 h antes de uma nova sessão intensa.", development: "O contorno aparece com progressão de carga, técnica consistente, descanso e composição corporal." },
  calves: { label: "Panturrilhas", function: "Gastrocnêmio e sóleo fazem a flexão plantar do tornozelo e ajudam no impulso ao caminhar, correr e saltar.", activation: "Use amplitude confortável, pause no alto e desça devagar sem perder o apoio do pé.", recovery: "Podem ser treinadas com mais frequência, desde que a recuperação e a técnica estejam boas.", development: "O contorno aparece com progressão de carga, técnica consistente, descanso e composição corporal." },
};

const MOVEMENT_INSIGHT: MuscleInsight = { label: "Movimento integrado", function: "Este exercício combina articulações e músculos para executar o padrão com segurança.", activation: "Acompanhe o GIF, controle o ritmo e respeite a amplitude que o professor prescreveu.", recovery: "A recuperação depende da intensidade, do volume e da sua rotina de treino.", development: "A evolução visual não tem prazo fixo: ela depende de constância, recuperação e composição corporal." };
const MUSCLE_LOCATIONS: Partial<Record<MuscleZone, string>> = {
  frontShoulders: "Face anterior e lateral do ombro, entre a clavícula e o braço.", rearShoulders: "Face posterior do ombro, junto à escápula.", chest: "Parte anterior do tórax, sobre as costelas e abaixo da clavícula.", biceps: "Face anterior do braço, entre o ombro e o cotovelo.", triceps: "Face posterior do braço, entre o ombro e o cotovelo.", forearms: "Entre o cotovelo e o punho, envolvendo os músculos da pegada.", upperBack: "Região superior das costas, entre pescoço, escápulas e clavículas.", lats: "Laterais das costas, do braço até a região toracolombar.", lowerBack: "Faixa muscular ao lado da coluna, na região lombar.", abs: "Parede anterior do abdômen, entre as costelas e a pelve.", obliques: "Laterais do abdômen, acompanhando as costelas até a pelve.", glutes: "Região posterior do quadril e da pelve.", quads: "Face anterior da coxa, entre o quadril e o joelho.", hamstrings: "Face posterior da coxa, entre o quadril e a parte de trás do joelho.", calves: "Parte posterior da perna, abaixo do joelho e acima do tornozelo.",
};
const ZONE_PRIORITY: MuscleZone[] = ["chest", "rearShoulders", "frontShoulders", "biceps", "triceps", "upperBack", "lats", "lowerBack", "abs", "obliques", "glutes", "quads", "hamstrings", "calves", "forearms"];
const CALLOUT_LABELS: Record<MuscleZone, string> = { frontShoulders: "DELTOIDES", rearShoulders: "DELTOIDE POST.", chest: "PEITORAL", biceps: "BÍCEPS", triceps: "TRÍCEPS", forearms: "ANTEBRAÇO", upperBack: "TRAPÉZIO", lats: "DORSAIS", lowerBack: "LOMBAR", abs: "ABDÔMEN", obliques: "OBLÍQUOS", glutes: "GLÚTEOS", quads: "QUADRÍCEPS", hamstrings: "POSTERIORES", calves: "PANTURRILHAS" };
const ANATOMY_CALLOUTS: Record<AnatomyView, Partial<Record<MuscleZone, Callout>>> = {
  front: {
    frontShoulders: { target: [107, 121], elbow: [70, 105], label: [42, 97], align: "start" }, chest: { target: [193, 130], elbow: [239, 116], label: [281, 108], align: "end" }, biceps: { target: [228, 166], elbow: [258, 155], label: [286, 147], align: "end" }, forearms: { target: [250, 223], elbow: [270, 211], label: [289, 204], align: "end" }, abs: { target: [177, 197], elbow: [235, 193], label: [282, 185], align: "end" }, obliques: { target: [199, 200], elbow: [241, 216], label: [284, 210], align: "end" }, quads: { target: [189, 304], elbow: [239, 290], label: [283, 282], align: "end" }, calves: { target: [188, 435], elbow: [236, 425], label: [282, 417], align: "end" },
  },
  side: {
    frontShoulders: { target: [164, 114], elbow: [220, 100], label: [280, 92], align: "end" }, rearShoulders: { target: [146, 116], elbow: [90, 104], label: [41, 96], align: "start" }, chest: { target: [183, 127], elbow: [239, 123], label: [281, 115], align: "end" }, biceps: { target: [157, 159], elbow: [225, 160], label: [281, 152], align: "end" }, triceps: { target: [145, 163], elbow: [82, 163], label: [37, 155], align: "start" }, upperBack: { target: [139, 111], elbow: [76, 93], label: [40, 85], align: "start" }, lats: { target: [139, 181], elbow: [76, 181], label: [39, 173], align: "start" }, lowerBack: { target: [142, 224], elbow: [77, 229], label: [40, 221], align: "start" }, abs: { target: [168, 187], elbow: [236, 190], label: [282, 182], align: "end" }, obliques: { target: [151, 186], elbow: [85, 193], label: [38, 185], align: "start" }, glutes: { target: [135, 255], elbow: [70, 255], label: [36, 247], align: "start" }, quads: { target: [151, 316], elbow: [227, 310], label: [282, 302], align: "end" }, hamstrings: { target: [137, 316], elbow: [70, 315], label: [36, 307], align: "start" }, calves: { target: [138, 433], elbow: [222, 426], label: [282, 418], align: "end" },
  },
  back: {
    frontShoulders: { target: [211, 122], elbow: [252, 109], label: [285, 101], align: "end" }, rearShoulders: { target: [211, 122], elbow: [252, 109], label: [285, 101], align: "end" }, triceps: { target: [226, 165], elbow: [257, 158], label: [287, 150], align: "end" }, forearms: { target: [246, 225], elbow: [271, 215], label: [289, 207], align: "end" }, upperBack: { target: [138, 129], elbow: [76, 113], label: [40, 105], align: "start" }, lats: { target: [133, 184], elbow: [71, 186], label: [37, 178], align: "start" }, lowerBack: { target: [140, 234], elbow: [72, 235], label: [37, 227], align: "start" }, obliques: { target: [131, 215], elbow: [70, 210], label: [37, 202], align: "start" }, glutes: { target: [190, 255], elbow: [241, 253], label: [285, 245], align: "end" }, hamstrings: { target: [132, 315], elbow: [76, 306], label: [36, 298], align: "start" }, calves: { target: [188, 436], elbow: [239, 426], label: [284, 418], align: "end" },
  },
};

function selectedZone(zones: Set<MuscleZone>) { return ZONE_PRIORITY.find((zone) => zones.has(zone)); }
function insightFor(zones: Set<MuscleZone>) { const zone = selectedZone(zones); return { zone, insight: zone ? MUSCLE_INSIGHTS[zone] : MOVEMENT_INSIGHT }; }
function exerciseNameOrigin(name: string) {
  const text = normalize(name);
  if (/supino/.test(text)) return "Supino vem da posição deitado de costas. O nome descreve a base usada para empurrar a carga.";
  if (/remada|row/.test(text)) return "Remada recebe esse nome porque repete o gesto de puxar usado ao remar, trazendo a resistência em direção ao tronco.";
  if (/agachamento|squat/.test(text)) return "Agachamento descreve o padrão de sentar e levantar controlando quadril, joelhos e tronco.";
  if (/rosca|curl/.test(text)) return "Rosca descreve o arco de flexão do cotovelo, como se o antebraço enrolasse a carga em direção ao braço.";
  if (/terra|deadlift/.test(text)) return "Levantamento terra recebeu esse nome por partir do chão: a carga sai da terra com o corpo organizado para levantá-la.";
  if (/good morning/.test(text)) return "Good morning recebeu esse nome porque o gesto lembra uma reverência educada para cumprimentar alguém.";
  if (/prancha|plank/.test(text)) return "Prancha é uma referência à posição firme e alinhada do corpo, como uma tábua estável.";
  if (/elevacao pelvica|hip thrust/.test(text)) return "Elevação pélvica descreve exatamente o gesto central: impulsionar o quadril contra a resistência.";
  if (/panturrilha/.test(text)) return "O nome usa a região trabalhada e lembra a função de elevar o calcanhar, comum em caminhadas e saltos.";
  return "O nome do exercício normalmente descreve seu padrão de movimento, a posição do corpo ou o equipamento usado.";
}

function AnatomyFigure({ primary, secondary, profile, view }: { primary: Set<MuscleZone>; secondary: Set<MuscleZone>; profile: "masculino" | "feminino"; view: AnatomyView }) {
  const image = view === "back" ? "/anatomy-body-back.png" : view === "side" ? "/anatomy-body-side.png" : profile === "feminino" ? "/anatomy-body-feminine.png" : "/anatomy-body-base.png";
  const paths = view === "back" ? BACK_PATHS : view === "side" ? SIDE_PATHS : FRONT_PATHS;
  const { zone } = insightFor(primary);
  const callout = zone ? ANATOMY_CALLOUTS[view][zone] : undefined;
  return <svg className="anatomy-image" viewBox="0 0 320 560" role="img" aria-label={`Corpo anatômico visto de ${VIEW_LABEL[view].toLowerCase()}`}>
    <defs>
      <filter id={`muscle-glow-${view}`} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      <linearGradient id={`primary-${view}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ff8277" /><stop offset=".45" stopColor="#ff3838" /><stop offset="1" stopColor="#c51418" /></linearGradient>
      <linearGradient id={`secondary-${view}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ffc56e" /><stop offset=".5" stopColor="#ff922e" /><stop offset="1" stopColor="#d66416" /></linearGradient>
    </defs>
    <image href={image} x="0" y="0" width="320" height="560" preserveAspectRatio="xMidYMid slice" />
    <g className="anatomy-muscle-overlay" filter={`url(#muscle-glow-${view})`}>
      {[...primary].flatMap((zone) => paths[zone].map((path, index) => <path key={`p-${zone}-${index}`} className="muscle-primary" d={path} fill={`url(#primary-${view})`} />))}
      {[...secondary].filter((zone) => !primary.has(zone)).flatMap((zone) => paths[zone].map((path, index) => <path key={`s-${zone}-${index}`} className="muscle-secondary" d={path} fill={`url(#secondary-${view})`} />))}
    </g>
    {callout && zone && <g className="anatomy-callout" aria-hidden="true"><path d={`M${callout.target[0]} ${callout.target[1]} L${callout.elbow[0]} ${callout.elbow[1]} L${callout.label[0]} ${callout.label[1]}`} /><circle cx={callout.target[0]} cy={callout.target[1]} r="3" /><text x={callout.label[0]} y={callout.label[1] - 5} textAnchor={callout.align}>{CALLOUT_LABELS[zone]}</text></g>}
  </svg>;
}

export function ExerciseAnatomyView({ exercise, onClose }: { exercise: ExerciseAnatomyData; onClose: () => void }) {
  const primaryZones = muscleZones(exercise.primaryMuscle, exercise.name); const secondaryZones = muscleZones(exercise.secondaryMuscles ?? "");
  const profile = exercise.anatomyProfile === "feminino" ? "feminino" : "masculino";
  const { insight } = insightFor(primaryZones);
  const metric = exercise.metricMode === "cardio" ? { load: "Velocidade", loadUnit: "km/h", reps: "Tempo", repsUnit: "min" } : exercise.metricMode === "timed" ? { load: "Intensidade", loadUnit: "", reps: "Tempo", repsUnit: "s" } : { load: "Carga", loadUnit: "kg", reps: "Repetições", repsUnit: "rep." };
  const [view, setView] = useState<AnatomyView>(() => recommendedView(primaryZones)); const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const gesture = useRef({ x: 0, y: 0, distance: 0, zoom: 1, panX: 0, panY: 0, pinched: false });
  useEffect(() => { const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape); }, [onClose]);
  const resetZoom = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const changeZoom = (amount: number) => { setZoom((current) => Math.min(3, Math.max(1, current + amount))); setPan({ x: 0, y: 0 }); };
  const chooseView = (next: AnatomyView) => { setView(next); resetZoom(); };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    const points = [...pointers.current.values()];
    gesture.current = { x: event.clientX, y: event.clientY, zoom, panX: pan.x, panY: pan.y,
      distance: points.length === 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0,
      pinched: points.length > 1 };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    const start = gesture.current;
    if (points.length === 2 && start.distance > 0) {
      setZoom(Math.min(3, Math.max(1, start.zoom * Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) / start.distance)));
      setPan({ x: 0, y: 0 });
    } else if (points.length === 1 && zoom > 1 && !start.pinched) {
      const limitX = event.currentTarget.clientWidth * (zoom - 1) / 2;
      const limitY = event.currentTarget.clientHeight * (zoom - 1) / 2;
      setPan({ x: Math.max(-limitX, Math.min(limitX, start.panX + event.clientX - start.x)), y: Math.max(-limitY, Math.min(limitY, start.panY + event.clientY - start.y)) });
    }
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const start = gesture.current;
    pointers.current.delete(event.pointerId);
    const distance = event.clientX - start.x;
    if (!start.pinched && zoom === 1 && Math.abs(distance) > 42 && Math.abs(distance) > Math.abs(event.clientY - start.y)) {
      const current = VIEW_ORDER.indexOf(view);
      chooseView(VIEW_ORDER[(current + (distance < 0 ? 1 : VIEW_ORDER.length - 1)) % VIEW_ORDER.length]);
    }
  };
  return <div ref={dialog} className="anatomy-screen" role="dialog" aria-modal="true" aria-labelledby="anatomy-title" onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    if (!buttons?.length) return;
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    <header><button type="button" aria-label="Voltar ao treino" onClick={onClose}><ArrowLeft /></button><h2 id="anatomy-title">{exercise.name}</h2><span /></header>
    <main>
      <div className="anatomy-realistic-viewer">
        <div className="anatomy-realistic-stage" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => pointers.current.clear()} onLostPointerCapture={(event) => pointers.current.delete(event.pointerId)} onWheel={(event: ReactWheelEvent<HTMLDivElement>) => { changeZoom(event.deltaY < 0 ? .08 : -.08); }}><div className="anatomy-realistic-zoom" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}><AnatomyFigure primary={primaryZones} secondary={secondaryZones} profile={profile} view={view} /></div></div>
        <div className="anatomy-view-presets" role="group" aria-label="Posição do corpo anatômico">{VIEW_ORDER.map((item) => <button type="button" key={item} className={view === item ? "active" : ""} onClick={() => chooseView(item)}>{VIEW_LABEL[item]}</button>)}</div>
        <div className="anatomy-controls"><span>Pinça para ampliar · {Math.round(zoom * 100)}%<br />{zoom > 1 ? "Arraste para explorar" : "Deslize para trocar a vista"}</span><div><button type="button" aria-label="Diminuir zoom" disabled={zoom <= 1} onClick={() => changeZoom(-.25)}><ZoomOut /></button><button type="button" aria-label="Restaurar zoom" onClick={resetZoom}><RotateCcw /></button><button type="button" aria-label="Aumentar zoom" disabled={zoom >= 3} onClick={() => changeZoom(.25)}><ZoomIn /></button></div></div>
      </div>
      <section className="muscle-legend"><div><i className="primary" /><span>Músculo principal</span><strong>{exercise.primaryMuscle || "Grupo principal"}</strong></div><div><i className="secondary" /><span>Auxiliares</span><strong>{exercise.secondaryMuscles || "Não informados"}</strong></div></section>
      <section className="anatomy-insight" aria-labelledby="anatomy-insight-title"><header><span>LEITURA ANATÔMICA</span><h3 id="anatomy-insight-title">{insight.label}</h3><p>Vermelho marca o foco principal do GIF; âmbar mostra os músculos que auxiliam o movimento.</p></header><div className="anatomy-facts"><div><Activity /><span>ONDE FICA</span><strong>{(selectedZone(primaryZones) && MUSCLE_LOCATIONS[selectedZone(primaryZones) as MuscleZone]) || "A região destacada acompanha o foco principal deste movimento."}</strong></div><div><Activity /><span>COMO TRABALHA</span><strong>{insight.function}</strong></div><div><Dumbbell /><span>COMO ATIVAR</span><strong>{insight.activation}</strong></div><div><Timer /><span>RECUPERAÇÃO</span><strong>{insight.recovery}</strong></div><div><Weight /><span>DESENVOLVIMENTO</span><strong>{insight.development}</strong></div></div></section>
      <section className="anatomy-curiosity"><BookOpen /><div><span>CURIOSIDADE DO MOVIMENTO</span><p>{exerciseNameOrigin(exercise.name)}</p></div></section>
      <section className="anatomy-metrics" aria-label="Dados atuais da ficha"><div><Dumbbell /><strong>{exercise.sets}</strong><span>séries</span></div><div><RefreshCw /><strong>{exercise.reps}</strong><span>{exercise.metricMode === "strength" || !exercise.metricMode ? "repetições" : `${metric.reps.toLocaleLowerCase("pt-BR")} · ${metric.repsUnit}`}</span></div><div><Weight /><strong>{exercise.load || "—"}</strong><span>{metric.load.toLocaleLowerCase("pt-BR")}{exercise.load && metric.loadUnit ? ` · ${metric.loadUnit}` : ""}</span></div><div><Timer /><strong>{exercise.rest.replace(/\s*s$/i, "")} s</strong><span>descanso</span></div></section>
    </main>
  </div>;
}
