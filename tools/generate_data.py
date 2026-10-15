#!/usr/bin/env python3
"""Generates data/program.json and data/seed/*.csv from the definitions below.

Run: python3 tools/generate_data.py
"""
import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (id, name_pt, muscle_group, equipment, media, increment_kg, start_load_kg, load_note,
#  alternatives, instructions, is_squat_variant)
EXERCISES = [
    # ---------- Chest ----------
    ("db_bench_press", "Supino reto com halteres", "peito", "halteres", "Dumbbell_Bench_Press", 2, 10, "kg por halter",
     ["machine_chest_press", "smith_bench_press"],
     ["Escápulas juntas e para baixo, pés firmes no chão.", "Desça os halteres até a linha do peito com cotovelos a ~45° do tronco.", "Empurre sem bater os halteres no topo."]),
    ("machine_chest_press", "Supino máquina (chest press)", "peito", "máquina", "Leverage_Chest_Press", 5, 20, "carga da placa",
     ["db_bench_press", "smith_bench_press"],
     ["Ajuste o banco para a pegada ficar na altura do meio do peito.", "Costas apoiadas, empurre sem travar os cotovelos.", "Volte devagar (2–3 s)."]),
    ("smith_bench_press", "Supino reto no smith", "peito", "smith", "Smith_Machine_Bench_Press", 2.5, 10, "anilhas somadas (sem a barra)",
     ["db_bench_press", "machine_chest_press"],
     ["Posicione o banco para a barra descer na linha do mamilo.", "Pegada um pouco mais larga que os ombros.", "Desça controlando e empurre."]),
    ("db_incline_press", "Supino inclinado com halteres", "peito", "halteres", "Incline_Dumbbell_Press", 2, 8, "kg por halter",
     ["smith_incline_press", "machine_incline_press"],
     ["Banco a 30–45°.", "Desça até a parte alta do peito, cotovelos levemente fechados.", "Empurre para cima e um pouco para dentro."]),
    ("smith_incline_press", "Supino inclinado no smith", "peito", "smith", "Smith_Machine_Incline_Bench_Press", 2.5, 10, "anilhas somadas (sem a barra)",
     ["db_incline_press", "machine_incline_press"],
     ["Banco a 30–45° com a barra descendo na parte alta do peito.", "Escápulas encaixadas.", "Movimento controlado."]),
    ("machine_incline_press", "Supino inclinado máquina", "peito", "máquina", "Leverage_Incline_Chest_Press", 5, 20, "carga da placa",
     ["db_incline_press", "smith_incline_press"],
     ["Ajuste o assento para a pegada ficar na altura do peito alto.", "Empurre sem travar os cotovelos.", "Volte devagar."]),
    ("pec_deck", "Crucifixo máquina (voador)", "peito", "máquina", "Butterfly", 5, 20, "carga da placa",
     ["cable_fly", "db_fly"],
     ["Cotovelos levemente flexionados e na altura dos ombros.", "Feche os braços 'abraçando' e aperte o peito por 1 s.", "Abra até sentir alongar, sem dor no ombro."]),
    ("cable_fly", "Crucifixo no crossover", "peito", "polia", "Cable_Crossover", 2.5, 10, "carga por lado",
     ["pec_deck", "db_fly"],
     ["Um pé à frente, tronco levemente inclinado.", "Traga as mãos à frente do peito em arco.", "Volte devagar até alongar."]),
    ("db_fly", "Crucifixo com halteres", "peito", "halteres", "Dumbbell_Flyes", 2, 6, "kg por halter",
     ["pec_deck", "cable_fly"],
     ["Cotovelos levemente flexionados e fixos.", "Abra até a linha do peito, sem descer demais.", "Feche em arco."]),
    # ---------- Back ----------
    ("seated_cable_row", "Remada baixa no cabo (triângulo)", "costas", "polia", "Seated_Cable_Rows", 5, 25, "carga da placa",
     ["machine_row", "one_arm_db_row"],
     ["Tronco ereto, joelhos levemente flexionados.", "Puxe o triângulo até o umbigo levando os cotovelos para trás.", "Aperte as escápulas e volte sem curvar a lombar."]),
    ("machine_row", "Remada máquina (apoio no peito)", "costas", "máquina", "Leverage_Iso_Row", 5, 20, "carga da placa",
     ["seated_cable_row", "one_arm_db_row"],
     ["Peito apoiado no encosto.", "Puxe levando os cotovelos para trás e junte as escápulas.", "Volte controlando."]),
    ("one_arm_db_row", "Remada unilateral com halter (serrote)", "costas", "halteres", "One-Arm_Dumbbell_Row", 2, 12, "kg do halter",
     ["machine_row", "seated_cable_row"],
     ["Joelho e mão no banco, coluna neutra.", "Puxe o halter em direção ao quadril.", "Desça alongando sem girar o tronco."]),
    ("lat_pulldown", "Puxada frontal aberta", "costas", "polia", "Wide-Grip_Lat_Pulldown", 5, 25, "carga da placa",
     ["close_grip_pulldown", "underhand_pulldown"],
     ["Pegada um pouco mais larga que os ombros.", "Puxe a barra até o queixo/peito alto, cotovelos para baixo.", "Suba controlando até esticar os braços."]),
    ("close_grip_pulldown", "Puxada com triângulo (pegada neutra)", "costas", "polia", "V-Bar_Pulldown", 5, 25, "carga da placa",
     ["lat_pulldown", "underhand_pulldown"],
     ["Tronco levemente inclinado para trás.", "Puxe o triângulo até o peito.", "Suba devagar alongando as costas."]),
    ("underhand_pulldown", "Puxada supinada", "costas", "polia", "Underhand_Cable_Pulldowns", 5, 25, "carga da placa",
     ["lat_pulldown", "close_grip_pulldown"],
     ["Pegada supinada (palmas para você) na largura dos ombros.", "Puxe até o peito alto.", "Controle a subida."]),
    # ---------- Shoulders ----------
    ("db_shoulder_press", "Desenvolvimento com halteres (sentado)", "ombros", "halteres", "Dumbbell_Shoulder_Press", 2, 8, "kg por halter",
     ["machine_shoulder_press", "smith_shoulder_press"],
     ["Banco a ~80–90°, costas apoiadas.", "Halteres na linha das orelhas, empurre para cima.", "Não arqueie a lombar."]),
    ("machine_shoulder_press", "Desenvolvimento máquina", "ombros", "máquina", "Leverage_Shoulder_Press", 5, 15, "carga da placa",
     ["db_shoulder_press", "smith_shoulder_press"],
     ["Pegada na altura dos ombros.", "Empurre sem travar os cotovelos.", "Desça controlando."]),
    ("smith_shoulder_press", "Desenvolvimento no smith", "ombros", "smith", "Smith_Machine_Overhead_Shoulder_Press", 2.5, 5, "anilhas somadas (sem a barra)",
     ["db_shoulder_press", "machine_shoulder_press"],
     ["Banco sob a barra, encosto quase reto.", "Desça até a altura do queixo.", "Empurre sem arquear as costas."]),
    ("db_lateral_raise", "Elevação lateral com halteres", "ombros", "halteres", "Side_Lateral_Raise", 1, 4, "kg por halter",
     ["cable_lateral_raise"],
     ["Leve inclinação à frente, cotovelos levemente flexionados.", "Suba até a altura dos ombros, sem balançar.", "Desça em 2–3 s."]),
    ("cable_lateral_raise", "Elevação lateral na polia", "ombros", "polia", "Cable_Seated_Lateral_Raise", 2.5, 5, "carga da placa",
     ["db_lateral_raise"],
     ["Polia baixa, cabo passando à frente do corpo.", "Eleve até a altura do ombro.", "Volte devagar."]),
    ("reverse_pec_deck", "Crucifixo invertido máquina", "ombros", "máquina", "Reverse_Machine_Flyes", 5, 15, "carga da placa",
     ["face_pull", "db_rear_delt"],
     ["Peito apoiado no encosto do voador.", "Abra os braços para trás na altura dos ombros.", "Pausa de 1 s e volte devagar."]),
    ("face_pull", "Face pull na polia (corda)", "ombros", "polia", "Face_Pull", 2.5, 10, "carga da placa",
     ["reverse_pec_deck", "db_rear_delt"],
     ["Polia na altura do rosto, corda com pegada neutra.", "Puxe em direção à testa abrindo os cotovelos.", "Volte controlando."]),
    ("db_rear_delt", "Crucifixo invertido com halteres", "ombros", "halteres", "Seated_Bent-Over_Rear_Delt_Raise", 1, 3, "kg por halter",
     ["reverse_pec_deck", "face_pull"],
     ["Sentado, tronco inclinado à frente.", "Abra os braços para os lados com cotovelos levemente flexionados.", "Sem usar impulso."]),
    # ---------- Biceps ----------
    ("db_curl", "Rosca alternada com halteres", "bíceps", "halteres", "Dumbbell_Alternate_Bicep_Curl", 1, 6, "kg por halter",
     ["cable_curl", "machine_curl"],
     ["Cotovelos colados ao corpo.", "Suba girando a palma para cima.", "Desça devagar até esticar."]),
    ("cable_curl", "Rosca direta na polia", "bíceps", "polia", "Standing_Biceps_Cable_Curl", 2.5, 10, "carga da placa",
     ["db_curl", "machine_curl"],
     ["Polia baixa com barra reta.", "Cotovelos fixos ao lado do corpo.", "Sem balançar o tronco."]),
    ("machine_curl", "Rosca scott máquina", "bíceps", "máquina", "Machine_Preacher_Curls", 2.5, 10, "carga da placa",
     ["cable_curl", "db_curl"],
     ["Axilas encaixadas no apoio.", "Suba contraindo o bíceps.", "Desça até quase esticar, devagar."]),
    ("hammer_curl", "Rosca martelo", "bíceps", "halteres", "Hammer_Curls", 1, 6, "kg por halter",
     ["rope_hammer_curl", "db_curl"],
     ["Pegada neutra (palmas para dentro).", "Cotovelos fixos.", "Suba e desça controlando."]),
    ("rope_hammer_curl", "Rosca martelo na polia (corda)", "bíceps", "polia", "Cable_Hammer_Curls_-_Rope_Attachment", 2.5, 10, "carga da placa",
     ["hammer_curl", "cable_curl"],
     ["Polia baixa com corda.", "Pegada neutra, cotovelos fixos.", "Desça devagar."]),
    # ---------- Triceps ----------
    ("triceps_pushdown", "Tríceps na polia (barra)", "tríceps", "polia", "Triceps_Pushdown", 2.5, 15, "carga da placa",
     ["rope_pushdown", "overhead_rope_ext"],
     ["Cotovelos colados ao corpo.", "Empurre até esticar os braços.", "Suba só até 90° no cotovelo."]),
    ("rope_pushdown", "Tríceps na polia (corda)", "tríceps", "polia", "Triceps_Pushdown_-_Rope_Attachment", 2.5, 12.5, "carga da placa",
     ["triceps_pushdown", "overhead_rope_ext"],
     ["Cotovelos fixos.", "No final, afaste as pontas da corda.", "Volte controlando."]),
    ("overhead_rope_ext", "Tríceps francês na polia (corda)", "tríceps", "polia", "Triceps_Overhead_Extension_with_Rope", 2.5, 10, "carga da placa",
     ["db_overhead_ext", "rope_pushdown"],
     ["De costas para a polia, corda atrás da cabeça.", "Estenda os braços à frente/acima.", "Cotovelos apontando para frente."]),
    ("db_overhead_ext", "Tríceps francês com halter", "tríceps", "halteres", "Standing_Dumbbell_Triceps_Extension", 2, 8, "kg do halter",
     ["overhead_rope_ext", "triceps_pushdown"],
     ["Sentado, halter com as duas mãos atrás da cabeça.", "Estenda os braços para cima.", "Cotovelos apontando para frente."]),
    # ---------- Quads ----------
    ("leg_press", "Leg press 45°", "quadríceps", "máquina", "Leg_Press", 5, 40, "anilhas somadas (sem o carrinho)",
     ["leg_press_horizontal", "bulgarian_split_squat"],
     ["Pés na largura dos ombros no meio da plataforma.", "Desça até ~90° nos joelhos sem tirar a lombar do encosto.", "Empurre sem travar os joelhos."]),
    ("leg_press_horizontal", "Leg press horizontal (sentado)", "quadríceps", "máquina", None, 5, 40, "carga da placa",
     ["leg_press", "leg_extension"],
     ["Costas e quadril apoiados.", "Desça até ~90° nos joelhos.", "Empurre sem travar os joelhos."]),
    ("leg_extension", "Cadeira extensora", "quadríceps", "máquina", "Leg_Extensions", 5, 20, "carga da placa",
     ["single_leg_extension", "leg_press"],
     ["Joelho alinhado com o eixo da máquina.", "Estenda as pernas e segure 1 s no topo.", "Desça devagar."]),
    ("single_leg_extension", "Cadeira extensora unilateral", "quadríceps", "máquina", "Single-Leg_Leg_Extension", 2.5, 10, "carga da placa",
     ["leg_extension", "leg_press"],
     ["Uma perna por vez, mesma técnica da extensora.", "Faça as reps planejadas em cada perna.", "Registre a carga usada."]),
    # ---------- Hamstrings ----------
    ("lying_leg_curl", "Mesa flexora", "posteriores", "máquina", "Lying_Leg_Curls", 5, 20, "carga da placa",
     ["seated_leg_curl", "standing_leg_curl"],
     ["Rolo logo acima do calcanhar.", "Quadril colado no banco.", "Flexione e desça devagar."]),
    ("seated_leg_curl", "Cadeira flexora", "posteriores", "máquina", "Seated_Leg_Curl", 5, 20, "carga da placa",
     ["lying_leg_curl", "standing_leg_curl"],
     ["Trave da coxa bem presa.", "Flexione puxando o rolo para baixo.", "Volte devagar."]),
    ("standing_leg_curl", "Flexora em pé (unilateral)", "posteriores", "máquina", "Standing_Leg_Curl", 2.5, 10, "carga da placa",
     ["lying_leg_curl", "seated_leg_curl"],
     ["Uma perna por vez.", "Flexione sem mover o quadril.", "Desça controlando."]),
    ("db_rdl", "Stiff com halteres", "posteriores", "halteres", "Stiff-Legged_Dumbbell_Deadlift", 2, 10, "kg por halter",
     ["barbell_rdl", "smith_rdl"],
     ["Joelhos levemente flexionados e fixos.", "Leve o quadril para trás com a coluna neutra, halteres rentes às pernas.", "Desça até sentir o posterior alongar e suba contraindo o glúteo."]),
    ("barbell_rdl", "Levantamento terra romeno (barra)", "posteriores", "barra", "Romanian_Deadlift", 5, 20, "carga total (barra + anilhas)",
     ["db_rdl", "smith_rdl"],
     ["Barra rente às coxas.", "Quadril para trás, coluna neutra.", "Suba estendendo o quadril."]),
    ("smith_rdl", "Stiff no smith", "posteriores", "smith", "Smith_Machine_Stiff-Legged_Deadlift", 5, 10, "anilhas somadas (sem a barra)",
     ["db_rdl", "barbell_rdl"],
     ["Barra rente às pernas.", "Quadril para trás, coluna neutra.", "Suba contraindo o glúteo."]),
    # ---------- Glutes ----------
    ("hip_thrust", "Elevação pélvica com barra", "glúteos", "barra", "Barbell_Hip_Thrust", 5, 20, "carga total (barra + anilhas)",
     ["smith_hip_thrust", "glute_bridge"],
     ["Escápulas apoiadas no banco, barra no quadril (use proteção).", "Suba até alinhar tronco e coxas, queixo para baixo.", "Segure 1 s contraindo os glúteos."]),
    ("smith_hip_thrust", "Elevação pélvica no smith", "glúteos", "smith", None, 5, 10, "anilhas somadas (sem a barra)",
     ["hip_thrust", "glute_bridge"],
     ["Banco atrás de você, barra do smith no quadril.", "Suba até alinhar tronco e coxas.", "Pausa de 1 s no topo."]),
    ("glute_bridge", "Ponte de glúteo com barra (no solo)", "glúteos", "barra", "Barbell_Glute_Bridge", 5, 20, "carga total (barra + anilhas)",
     ["hip_thrust", "smith_hip_thrust"],
     ["Deitado no chão, barra sobre o quadril.", "Suba o quadril contraindo os glúteos.", "Desça controlando."]),
    ("abductor", "Cadeira abdutora", "glúteos", "máquina", "Thigh_Abductor", 5, 25, "carga da placa",
     ["cable_hip_abduction"],
     ["Costas apoiadas (ou tronco levemente à frente para mais glúteo).", "Abra as pernas e segure 1 s.", "Volte devagar."]),
    ("cable_hip_abduction", "Abdução de quadril na polia", "glúteos", "polia", None, 2.5, 5, "carga da placa",
     ["abductor"],
     ["Caneleira na polia baixa.", "Afaste a perna para o lado sem inclinar o tronco.", "Volte devagar."]),
    ("adductor", "Cadeira adutora", "adutores", "máquina", "Thigh_Adductor", 5, 25, "carga da placa",
     ["cable_hip_adduction"],
     ["Costas apoiadas.", "Feche as pernas e segure 1 s.", "Abra devagar até alongar."]),
    ("cable_hip_adduction", "Adução de quadril na polia", "adutores", "polia", "Cable_Hip_Adduction", 2.5, 5, "carga da placa",
     ["adductor"],
     ["Caneleira na polia baixa, de lado para a polia.", "Cruze a perna à frente da outra.", "Volte devagar."]),
    # ---------- Calves ----------
    ("standing_calf", "Panturrilha em pé (máquina)", "panturrilhas", "máquina", "Standing_Calf_Raises", 5, 20, "carga da placa",
     ["leg_press_calf", "smith_calf"],
     ["Ponta dos pés na plataforma, joelhos quase estendidos.", "Desça o calcanhar até alongar (pausa 1 s).", "Suba o máximo possível."]),
    ("leg_press_calf", "Panturrilha no leg press", "panturrilhas", "máquina", "Calf_Press_On_The_Leg_Press_Machine", 5, 30, "anilhas somadas (sem o carrinho)",
     ["standing_calf", "seated_calf"],
     ["Ponta dos pés na borda da plataforma.", "Não trave o leg press: mantenha as travas de segurança prontas.", "Amplitude total."]),
    ("smith_calf", "Panturrilha no smith", "panturrilhas", "smith", "Smith_Machine_Calf_Raise", 5, 10, "anilhas somadas (sem a barra)",
     ["standing_calf", "leg_press_calf"],
     ["Ponta dos pés sobre um step.", "Desça alongando e suba ao máximo.", "Controle o ritmo."]),
    ("seated_calf", "Panturrilha sentado", "panturrilhas", "máquina", "Seated_Calf_Raise", 5, 15, "carga da placa",
     ["leg_press_calf", "standing_calf"],
     ["Apoio sobre as coxas, ponta dos pés na plataforma.", "Pausa de 1 s embaixo alongando.", "Suba ao máximo."]),
    # ---------- Core ----------
    ("cable_crunch", "Abdominal na polia (ajoelhado)", "abdômen", "polia", "Cable_Crunch", 2.5, 15, "carga da placa",
     ["machine_crunch", "crunch"],
     ["Ajoelhado, corda ao lado da cabeça.", "Enrole a coluna levando os cotovelos aos joelhos.", "O quadril não se move."]),
    ("machine_crunch", "Abdominal máquina", "abdômen", "máquina", "Ab_Crunch_Machine", 5, 15, "carga da placa",
     ["cable_crunch", "crunch"],
     ["Ajuste o banco e segure as alças.", "Enrole o tronco contraindo o abdômen.", "Volte devagar."]),
    ("crunch", "Abdominal no solo", "abdômen", "peso corporal", "Crunches", 0, 0, "peso corporal (0 kg)",
     ["cable_crunch", "machine_crunch"],
     ["Joelhos flexionados, lombar no chão.", "Tire as escápulas do chão contraindo o abdômen.", "Sem puxar o pescoço."]),
    ("leg_raise", "Elevação de pernas no banco", "abdômen", "banco", "Flat_Bench_Lying_Leg_Raise", 0, 0, "peso corporal (0 kg)",
     ["reverse_crunch", "crunch"],
     ["Deitado no banco, segure atrás da cabeça.", "Suba as pernas até 90° sem tirar a lombar.", "Desça devagar."]),
    ("reverse_crunch", "Abdominal infra (reverso)", "abdômen", "peso corporal", "Reverse_Crunch", 0, 0, "peso corporal (0 kg)",
     ["leg_raise", "crunch"],
     ["Deitado, joelhos a 90°.", "Leve os joelhos ao peito tirando o quadril do chão.", "Desça controlando."]),
    # ---------- Squat variants (disabled by default) ----------
    ("db_lunge", "Afundo com halteres", "quadríceps", "halteres", "Dumbbell_Lunges", 2, 6, "kg por halter",
     ["leg_press", "leg_extension"],
     ["Passo à frente, desça até o joelho de trás quase tocar o chão.", "Tronco ereto.", "Volte empurrando com a perna da frente."], True),
    ("bulgarian_split_squat", "Agachamento búlgaro", "quadríceps", "halteres", "Split_Squat_with_Dumbbells", 2, 4, "kg por halter",
     ["leg_press", "leg_extension"],
     ["Pé de trás apoiado no banco.", "Desça na vertical até ~90° na perna da frente.", "Suba empurrando o calcanhar da frente."], True),
]

CARDIO_TYPES = [
    {"id": "esteira", "name_pt": "Esteira (caminhada inclinada)", "media": "Walking_Treadmill"},
    {"id": "bike", "name_pt": "Bike ergométrica", "media": "Bicycling_Stationary"},
    {"id": "elíptico", "name_pt": "Elíptico", "media": "Elliptical_Trainer"},
    {"id": "escada", "name_pt": "Escada (simulador)", "media": "Stairmaster"},
    {"id": "remo", "name_pt": "Remo ergométrico", "media": "Rowing_Stationary"},
]


def ex(eid, sets, rmin, rmax, rest, notes=""):
    return {"exercise_id": eid, "sets": sets, "rep_min": rmin, "rep_max": rmax, "rest_seconds": rest, "notes": notes}


CARDIO_DAY = {"type": "cardio", "session_name": "Cardio Z2 + mobilidade", "cardio": {
    "minutes_min": 25, "minutes_max": 35,
    "note": "Zona 2: ritmo em que você consegue conversar em frases completas (esforço 3–4 de 10). Esteira inclinada, bike ou elíptico. Termine com 5–10 min de mobilidade de quadril, tornozelo e ombros."}}
REST_DAY = {"type": "rest", "session_name": "Descanso"}
POST_LIFT_CARDIO = "Opcional: 10–20 min de cardio leve (zona 2) depois da musculação, nunca antes."

BASE_DAYS = {
    1: {"type": "lift", "session_name": "Superior A", "exercises": [
        ex("db_bench_press", 3, 8, 12, 120), ex("seated_cable_row", 3, 8, 12, 120),
        ex("db_shoulder_press", 3, 8, 12, 90), ex("lat_pulldown", 3, 8, 12, 90),
        ex("db_lateral_raise", 2, 12, 15, 60), ex("db_curl", 2, 10, 12, 60),
        ex("triceps_pushdown", 2, 10, 12, 60)]},
    2: {"type": "lift", "session_name": "Inferior A", "exercises": [
        ex("leg_press", 3, 10, 12, 120), ex("db_rdl", 3, 8, 12, 120),
        ex("leg_extension", 3, 12, 15, 90), ex("lying_leg_curl", 3, 10, 12, 90),
        ex("standing_calf", 3, 10, 15, 60), ex("cable_crunch", 2, 12, 15, 60)]},
    3: CARDIO_DAY,
    4: {"type": "lift", "session_name": "Superior B", "exercises": [
        ex("machine_row", 3, 8, 12, 120), ex("db_incline_press", 3, 8, 12, 120),
        ex("close_grip_pulldown", 3, 10, 12, 90), ex("pec_deck", 3, 12, 15, 60),
        ex("reverse_pec_deck", 2, 12, 15, 60), ex("hammer_curl", 2, 10, 12, 60),
        ex("overhead_rope_ext", 2, 10, 12, 60)]},
    5: {"type": "lift", "session_name": "Inferior B", "exercises": [
        ex("hip_thrust", 3, 8, 12, 120), ex("leg_press", 3, 12, 15, 120, "Pés um pouco mais altos na plataforma."),
        ex("seated_leg_curl", 3, 10, 12, 90), ex("abductor", 2, 12, 15, 60),
        ex("adductor", 2, 12, 15, 60), ex("seated_calf", 3, 12, 15, 60),
        ex("leg_raise", 2, 10, 15, 60)]},
    6: CARDIO_DAY,
    7: REST_DAY,
}

INTERMEDIATE_DAYS = {
    1: {"type": "lift", "session_name": "Superior A+", "exercises": [
        ex("db_bench_press", 4, 6, 10, 150), ex("seated_cable_row", 4, 8, 12, 120),
        ex("db_shoulder_press", 3, 8, 12, 90), ex("lat_pulldown", 3, 8, 12, 90),
        ex("cable_fly", 2, 12, 15, 60), ex("db_lateral_raise", 3, 12, 15, 60),
        ex("db_curl", 3, 10, 12, 60), ex("triceps_pushdown", 3, 10, 12, 60)]},
    2: {"type": "lift", "session_name": "Inferior A+", "exercises": [
        ex("leg_press", 4, 8, 12, 150), ex("db_rdl", 4, 8, 12, 120),
        ex("leg_extension", 3, 12, 15, 90), ex("lying_leg_curl", 3, 10, 12, 90),
        ex("hip_thrust", 2, 10, 12, 90), ex("standing_calf", 4, 10, 15, 60),
        ex("cable_crunch", 3, 12, 15, 60)]},
    3: CARDIO_DAY,
    4: {"type": "lift", "session_name": "Superior B+", "exercises": [
        ex("machine_row", 4, 8, 12, 120), ex("db_incline_press", 4, 8, 12, 120),
        ex("close_grip_pulldown", 3, 10, 12, 90), ex("pec_deck", 3, 12, 15, 60),
        ex("cable_lateral_raise", 2, 12, 15, 60), ex("reverse_pec_deck", 3, 12, 15, 60),
        ex("hammer_curl", 3, 10, 12, 60), ex("overhead_rope_ext", 3, 10, 12, 60)]},
    5: {"type": "lift", "session_name": "Inferior B+", "exercises": [
        ex("hip_thrust", 4, 8, 12, 120), ex("leg_press", 3, 12, 15, 120, "Pés um pouco mais altos na plataforma."),
        ex("seated_leg_curl", 4, 10, 12, 90), ex("single_leg_extension", 2, 12, 15, 60),
        ex("abductor", 3, 12, 15, 60), ex("adductor", 2, 12, 15, 60),
        ex("seated_calf", 3, 12, 15, 60), ex("leg_raise", 3, 10, 15, 60)]},
    6: CARDIO_DAY,
    7: REST_DAY,
}

WEEKDAY_PT = {1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 7: "Domingo"}

SOURCES = [
    {"key": "schoenfeld2016freq", "ref": "Schoenfeld BJ, Ogborn D, Krieger JW. Effects of Resistance Training Frequency on Measures of Muscle Hypertrophy: A Systematic Review and Meta-Analysis. Sports Med. 2016;46(11):1689-1697.", "doi": "10.1007/s40279-016-0543-8", "used_for": "Treinar cada grupo muscular 2x por semana (divisão Superior/Inferior)."},
    {"key": "schoenfeld2017vol", "ref": "Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly resistance training volume and increases in muscle mass: A systematic review and meta-analysis. J Sports Sci. 2017;35(11):1073-1082.", "doi": "10.1080/02640414.2016.1210197", "used_for": "~10 séries semanais por grupo como ponto de partida, aumentando no Intermediário."},
    {"key": "pelland2024", "ref": "Pelland JC, Remmert JF, Robinson ZP, et al. The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gain. SportRxiv (preprint), 2024.", "doi": "10.51224/SRXIV.460", "used_for": "Ganhos crescem com o volume com retornos decrescentes; frequência importa mais para força."},
    {"key": "schoenfeld2021reps", "ref": "Schoenfeld BJ, Grgic J, Van Every DW, Plotkin DL. Loading Recommendations for Muscle Strength, Hypertrophy, and Local Endurance: A Re-Examination of the Repetition Continuum. Sports. 2021;9(2):32.", "doi": "10.3390/sports9020032", "used_for": "Faixas de 6–15 repetições; 8–12 como padrão prático."},
    {"key": "refalo2023", "ref": "Refalo MC, Helms ER, Trexler ET, Hamilton DL, Fyfe JJ. Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy: A Systematic Review with Meta-analysis. Sports Med. 2023;53(3):649-665.", "doi": "10.1007/s40279-022-01784-y", "used_for": "Não é preciso ir à falha; terminar com 1–3 repetições em reserva (RIR)."},
    {"key": "robinson2024", "ref": "Robinson ZP, Pelland JC, Remmert JF, et al. Exploring the Dose-Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-Regressions. Sports Med. 2024;54(9):2209-2231.", "doi": "10.1007/s40279-024-02069-2", "used_for": "Hipertrofia aumenta ao se aproximar da falha; força pouco muda. Base para RIR 1–3."},
    {"key": "helms2016rir", "ref": "Helms ER, Cronin J, Storey A, Zourdos MC. Application of the Repetitions in Reserve-Based Rating of Perceived Exertion Scale for Resistance Training. Strength Cond J. 2016;38(4):42-49.", "doi": "10.1519/SSC.0000000000000218", "used_for": "Escala RIR/RPE usada no registro opcional de RPE."},
    {"key": "schoenfeld2016rest", "ref": "Schoenfeld BJ, Pope ZK, Benik FM, et al. Longer Interset Rest Periods Enhance Muscle Strength and Hypertrophy in Resistance-Trained Men. J Strength Cond Res. 2016;30(7):1805-1812.", "doi": "10.1519/JSC.0000000000001272", "used_for": "Descanso de 2 min nos compostos; 60–90 s nos isolados."},
    {"key": "singer2024rest", "ref": "Singer A, Wolf M, Generoso L, et al. Give it a rest: a systematic review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle hypertrophy. Front Sports Act Living. 2024;6:1429789.", "doi": "10.3389/fspor.2024.1429789", "used_for": "Descansos acima de 60 s trazem leve vantagem para hipertrofia."},
    {"key": "acsm2009", "ref": "American College of Sports Medicine. Position stand: Progression models in resistance training for healthy adults. Med Sci Sports Exerc. 2009;41(3):687-708.", "doi": "10.1249/MSS.0b013e3181915670", "used_for": "Dupla progressão: aumentar carga (~2–10%) ao passar do topo da faixa."},
    {"key": "wilson2012concurrent", "ref": "Wilson JM, Marin PJ, Rhea MR, et al. Concurrent training: a meta-analysis examining interference of aerobic and resistance exercises. J Strength Cond Res. 2012;26(8):2293-2307.", "doi": "10.1519/JSC.0b013e31823a3e2d", "used_for": "Cardio moderado e curto (bike/caminhada) interfere pouco na hipertrofia; feito depois da musculação."},
    {"key": "who2020", "ref": "Bull FC, Al-Ansari SS, Biddle S, et al. World Health Organization 2020 guidelines on physical activity and sedentary behaviour. Br J Sports Med. 2020;54(24):1451-1462.", "doi": "10.1136/bjsports-2020-102955", "used_for": "Meta semanal de 150–300 min de atividade aeróbica moderada + 2 dias de força."},
    {"key": "ogasawara2013", "ref": "Ogasawara R, Yasuda T, Ishii N, Abe T. Comparison of muscle hypertrophy following 6-month of continuous and periodic strength training. Eur J Appl Physiol. 2013;113(4):975-985.", "doi": "10.1007/s00421-012-2511-9", "used_for": "Músculo recupera rápido após pausas: justifica a semana de reentrada curta com cargas conservadoras."},
    {"key": "epley1985", "ref": "Epley B. Poundage Chart. Boyd Epley Workout. Lincoln, NE: Body Enterprises; 1985.", "doi": None, "used_for": "1RM estimado = carga × (1 + reps/30)."},
]

PROGRAM_RULES = {
    "split_rationale": "Superior/Inferior 4x por semana treina cada grupo 2x/semana com ~9–12 séries semanais nos grupos grandes, cabendo em sessões de ~50–60 min. Quarta e sábado ficam para cardio zona 2 e mobilidade (recuperação ativa e saúde cardiovascular), domingo é descanso total. Nunca há dois dias seguidos treinando os mesmos músculos.",
    "rir": {"base": "1–3 repetições em reserva (pare quando sentir que faria mais 1–3 reps com boa técnica).", "intermediate": "0–2 repetições em reserva nos isolados; 1–2 nos compostos."},
    "warmup": ["5 min de esteira ou bike leve.", "1 min de mobilidade: círculos de ombro, abertura de quadril.", "No 1º exercício: 1 série com ~50% da carga × 10 e 1 série com ~75% × 5 (não registrar)."],
    "reentry_week": {"weeks": 1, "set_delta": -1, "min_sets": 2, "rir": "3–4", "note": "Semana de reentrada: 1 série a menos em cada exercício e cargas conservadoras (RIR 3–4). Use para achar as cargas e reaprender a técnica."},
    "double_progression": {
        "rule": "Quando completar todas as séries no topo da faixa (ex.: 3×12) com boa execução, aumente a carga no próximo treino e volte para o início da faixa.",
        "increment_upper_kg": [1, 2.5], "increment_lower_kg": [2.5, 5],
        "stall_rule": "Se ficar abaixo do mínimo da faixa em 2 treinos seguidos, reduza ~10% e reconstrua."},
    "missed_rule": "Dia planejado de musculação ou cardio sem sessão registrada até 23h59 vira falta. Domingo (descanso) não conta e não quebra a sequência.",
    "intermediate_unlock": {"weeks_required": 8, "min_adherence": 0.8, "description": "8 semanas (não precisam ser seguidas) com aderência ≥ 80% desbloqueiam o nível Intermediário."},
    "cardio": "Zona 2 / leve-moderado: 25–35 min nos dias de cardio; opcional 10–20 min após a musculação.",
    "no_squat_policy": "Nenhuma variação de agachamento no plano (preferência pessoal). Afundo e búlgaro existem apenas como opção marcada com is_squat_variant=true, desligados por padrão (Configurações).",
}

EQUIPMENT_MAP = {
    "máquina": "Máquinas guiadas Smart Fit (chest press, voador/peck deck, remada, desenvolvimento, extensora, flexoras, abdutora/adutora, panturrilha, abdominal)",
    "polia": "Polias / crossover (puxadas, remadas, tríceps, rosca, elevação lateral, face pull, abdominal na polia)",
    "halteres": "Halteres (rack de halteres)",
    "barra": "Barras e anilhas livres",
    "smith": "Smith machine",
    "banco": "Bancos reto/inclinável",
    "peso corporal": "Colchonete / área de alongamento",
    "cardio": "Esteira, bike, elíptico, escada, remo (este último não existe em todas as unidades)",
}


def build():
    exercises = []
    for row in EXERCISES:
        (eid, name, group, equip, media, inc, start, note, alts, instr, *rest) = row
        squat = bool(rest and rest[0])
        exercises.append({
            "id": eid, "name_pt": name, "muscle_group": group, "equipment": equip,
            "media_url": f"img/ex/{eid}-0.jpg" if media else "",
            "media_frames": [f"img/ex/{eid}-0.jpg", f"img/ex/{eid}-1.jpg"] if media else [],
            "media_source": f"yuhonas/free-exercise-db: exercises/{media}" if media else "",
            "instructions": instr, "alternatives": alts, "is_squat_variant": squat,
            "active": not squat, "increment_kg": inc, "start_load_kg": start, "load_note": note,
        })
    ids = {e["id"] for e in exercises}
    for e in exercises:
        for a in e["alternatives"]:
            assert a in ids, (e["id"], a)

    def days(dct):
        out = []
        for wd in range(1, 8):
            d = dict(dct[wd])
            d["weekday"] = wd
            d["weekday_pt"] = WEEKDAY_PT[wd]
            if d["type"] == "lift":
                d["post_cardio"] = POST_LIFT_CARDIO
                for item in d["exercises"]:
                    assert item["exercise_id"] in ids, item
            out.append(d)
        return out

    program = {
        "version": 1,
        "name": "Projeto K — Superior/Inferior",
        "levels": {
            "base": {"label": "Base", "days": days(BASE_DAYS)},
            "intermediate": {"label": "Intermediário", "days": days(INTERMEDIATE_DAYS)},
        },
        "rules": PROGRAM_RULES,
        "exercises": exercises,
        "cardio_types": [{"id": c["id"], "name_pt": c["name_pt"],
                          "media_frames": [f"img/ex/cardio-{i}-0.jpg", f"img/ex/cardio-{i}-1.jpg"]}
                         for i, c in enumerate(CARDIO_TYPES)],
        "equipment_map": EQUIPMENT_MAP,
        "sources": SOURCES,
        "media_license": "Imagens: yuhonas/free-exercise-db (Unlicense / domínio público). https://github.com/yuhonas/free-exercise-db",
    }
    with open(os.path.join(ROOT, "data", "program.json"), "w", encoding="utf-8") as f:
        json.dump(program, f, ensure_ascii=False, indent=2)

    seed = os.path.join(ROOT, "data", "seed")
    os.makedirs(seed, exist_ok=True)
    with open(os.path.join(seed, "exercises.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "name_pt", "muscle_group", "equipment", "media_url", "instructions", "alternatives", "is_squat_variant", "active"])
        for e in exercises:
            w.writerow([e["id"], e["name_pt"], e["muscle_group"], e["equipment"], e["media_url"],
                        " | ".join(e["instructions"]), ",".join(e["alternatives"]),
                        str(e["is_squat_variant"]).upper(), str(e["active"]).upper()])
    with open(os.path.join(seed, "plans.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "level", "weekday", "session_name", "exercise_id", "order", "sets", "rep_min", "rep_max", "rest_seconds", "notes"])
        for level, lv in program["levels"].items():
            for d in lv["days"]:
                if d["type"] != "lift":
                    w.writerow([f"{level}-{d['weekday']}-0", level, d["weekday"], d["session_name"], "", 0, "", "", "", "", d.get("cardio", {}).get("note", "")])
                    continue
                for i, it in enumerate(d["exercises"], 1):
                    w.writerow([f"{level}-{d['weekday']}-{i}", level, d["weekday"], d["session_name"], it["exercise_id"], i,
                                it["sets"], it["rep_min"], it["rep_max"], it["rest_seconds"], it["notes"]])
    print(f"{len(exercises)} exercises written")
    return exercises, {row[0]: row[4] for row in EXERCISES}


if __name__ == "__main__":
    build()
