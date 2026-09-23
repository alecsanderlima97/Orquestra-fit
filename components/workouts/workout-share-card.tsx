"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Camera, Check, Download, ImagePlus, Share2, X } from "lucide-react";

export type ShareWorkoutSummary = {
  durationSeconds: number;
  calories?: number;
  totalVolume: number;
  maxLoad: number;
  completedSets: number;
  totalSets: number;
};

type Props = {
  workoutName: string;
  studentName: string;
  profilePhoto?: string;
  summary: ShareWorkoutSummary;
  onClose: () => void;
};

function durationLabel(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours ? `${hours}h ${minutes}min` : `${minutes}min ${String(remaining).padStart(2, "0")}s`;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - drawnWidth) / 2, (height - drawnHeight) / 2, drawnWidth, drawnHeight);
}

type MetricIcon = "clock" | "sets" | "flame" | "weight";

function drawMetricIcon(context: CanvasRenderingContext2D, icon: MetricIcon, x: number, y: number) {
  context.save();
  context.strokeStyle = "#e5b866";
  context.fillStyle = "#e5b866";
  context.lineWidth = 5;
  context.lineCap = "round";
  context.lineJoin = "round";
  if (icon === "clock") {
    context.beginPath();
    context.arc(x + 25, y + 25, 19, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(x + 25, y + 25);
    context.lineTo(x + 25, y + 13);
    context.moveTo(x + 25, y + 25);
    context.lineTo(x + 34, y + 31);
    context.stroke();
  } else if (icon === "flame") {
    context.beginPath();
    context.moveTo(x + 27, y + 5);
    context.bezierCurveTo(x + 45, y + 24, x + 42, y + 45, x + 25, y + 48);
    context.bezierCurveTo(x + 5, y + 47, x + 5, y + 28, x + 19, y + 16);
    context.bezierCurveTo(x + 17, y + 29, x + 28, y + 30, x + 27, y + 5);
    context.fill();
  } else if (icon === "weight") {
    context.beginPath();
    context.arc(x + 26, y + 10, 7, 0, Math.PI * 2);
    context.fill();
    context.moveTo(x + 26, y + 18);
    context.lineTo(x + 26, y + 36);
    context.moveTo(x + 26, y + 22);
    context.lineTo(x + 9, y + 30);
    context.lineTo(x + 2, y + 22);
    context.moveTo(x + 26, y + 22);
    context.lineTo(x + 43, y + 30);
    context.lineTo(x + 50, y + 22);
    context.moveTo(x + 26, y + 36);
    context.lineTo(x + 14, y + 49);
    context.moveTo(x + 26, y + 36);
    context.lineTo(x + 38, y + 49);
    context.stroke();
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(x, y + 18);
    context.lineTo(x, y + 31);
    context.moveTo(x + 5, y + 20);
    context.lineTo(x + 5, y + 29);
    context.moveTo(x + 52, y + 18);
    context.lineTo(x + 52, y + 31);
    context.moveTo(x + 47, y + 20);
    context.lineTo(x + 47, y + 29);
    context.stroke();
  } else {
    context.beginPath();
    context.moveTo(x + 4, y + 25);
    context.lineTo(x + 51, y + 25);
    context.stroke();
    context.lineWidth = 7;
    for (const offset of [0, 42]) {
      context.beginPath();
      context.moveTo(x + 7 + offset, y + 14);
      context.lineTo(x + 7 + offset, y + 36);
      context.stroke();
    }
  }
  context.restore();
}

function metric(context: CanvasRenderingContext2D, x: number, y: number, width: number, label: string, value: string, icon: MetricIcon) {
  context.fillStyle = "rgba(12, 15, 16, .72)";
  context.strokeStyle = "rgba(231, 184, 91, .38)";
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(x, y, width, 170, 28);
  context.fill();
  context.stroke();
  drawMetricIcon(context, icon, x + 25, y + 20);
  context.fillStyle = "#d4a65c";
  context.font = "700 25px Arial";
  context.fillText(label.toLocaleUpperCase("pt-BR"), x + 95, y + 50);
  context.fillStyle = "#ffffff";
  context.font = "700 42px Arial";
  context.fillText(value, x + 30, y + 116, width - 60);
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function formatShareTitle(name: string) {
  return name
    .replace(/\s*[·|]\s*/g, " • ")
    .replace(/\bfundação\b/gi, "Fundação")
    .replace(/\bombros\b/gi, "Ombros")
    .replace(/\bcore\b/gi, "Core")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function renderCard(canvas: HTMLCanvasElement, options: {
  photoUrl: string;
  workoutName: string;
  studentName: string;
  summary: ShareWorkoutSummary;
  showName: boolean;
  showPerformance: boolean;
}) {
  const width = 1080;
  const height = 1920;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;

  const fallback = await loadImage("/dama-de-ferro.jpeg");
  const damaLogo = await loadImage("/dama-de-ferro.jpeg").catch(() => null);
  let background = fallback;
  if (options.photoUrl) {
    try { background = await loadImage(options.photoUrl); } catch { background = fallback; }
  }
  drawCover(context, background, width, height);
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(5, 5, 5, .42)");
  gradient.addColorStop(.34, "rgba(7, 7, 7, .12)");
  gradient.addColorStop(.58, "rgba(8, 8, 8, .20)");
  gradient.addColorStop(1, "rgba(5, 5, 5, .90)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  const vignette = context.createRadialGradient(width / 2, height * .42, 120, width / 2, height * .42, 900);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, .38)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);

  const accent = "#d4a35f";
  const silver = "#c7ced0";

  if (damaLogo) {
    context.save();
    context.beginPath();
    context.roundRect(60, 60, 112, 112, 22);
    context.clip();
    context.drawImage(damaLogo, 60, 60, 112, 112);
    context.restore();
  }
  context.fillStyle = accent;
  context.fillRect(192, 60, 7, 116);
  context.fillStyle = silver;
  context.font = "800 40px Arial";
  context.fillText("DAMA DE FERRO", 222, 114);
  context.fillStyle = accent;
  context.font = "700 22px Arial";
  context.letterSpacing = "5px";
  context.fillText("ACADEMIA", 225, 154);
  context.letterSpacing = "0px";

  const contentTop = 820;
  context.fillStyle = accent;
  context.font = "800 25px Arial";
  context.fillText("TREINO CONCLUÍDO", 70, contentTop);
  context.fillStyle = "#ffffff";
  const shareTitle = formatShareTitle(options.workoutName);
  let titleFontSize = 58;
  context.font = `800 ${titleFontSize}px Arial`;
  while (titleFontSize > 36 && context.measureText(shareTitle).width > 940) {
    titleFontSize -= 2;
    context.font = `800 ${titleFontSize}px Arial`;
  }
  const titleLines = wrapCanvasText(context, shareTitle, 940);
  const titleLineHeight = Math.round(titleFontSize * 1.12);
  titleLines.forEach((line, index) => context.fillText(line, 70, contentTop + 88 + index * titleLineHeight, 940));
  const titleBottomOffset = 88 + (titleLines.length - 1) * titleLineHeight;
  if (options.showName) {
    context.fillStyle = "rgba(255, 255, 255, .78)";
    context.font = "500 31px Arial";
    context.fillText(options.studentName, 70, contentTop + titleBottomOffset + 54, 920);
  }

  const metricTop = contentTop + Math.max(205, titleBottomOffset + (options.showName ? 130 : 110));
  const metrics: Array<{ label: string; value: string; icon: MetricIcon }> = [
    { label: "Duração", value: durationLabel(options.summary.durationSeconds), icon: "clock" },
    { label: "Séries concluídas", value: String(options.summary.completedSets), icon: "sets" },
  ];
  if (options.showPerformance && options.summary.totalVolume > 0) metrics.push({ label: "Volume total", value: `${Math.round(options.summary.totalVolume).toLocaleString("pt-BR")} kg`, icon: "weight" });
  if (options.showPerformance && typeof options.summary.calories === "number" && options.summary.calories > 0) metrics.push({ label: "Calorias", value: `${options.summary.calories} kcal`, icon: "flame" });
  if (options.showPerformance && options.summary.maxLoad > 0) metrics.push({ label: "Maior carga", value: `${options.summary.maxLoad} kg`, icon: "weight" });
  metrics.forEach((item, index) => {
    const lastOdd = metrics.length % 2 === 1 && index === metrics.length - 1;
    const row = Math.floor(index / 2);
    metric(context, lastOdd ? 70 : index % 2 === 0 ? 70 : 555, metricTop + row * 195, lastOdd ? 940 : 455, item.label, item.value, item.icon);
  });

  const footerY = height - 100;
  context.fillStyle = "rgba(255, 255, 255, .66)";
  context.font = "500 22px Arial";
  context.fillText(new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date()), 70, footerY);
  context.textAlign = "right";
  context.globalAlpha = .52;
  context.fillStyle = silver;
  context.font = "700 18px Arial";
  context.fillText("ORQUESTRA FIT", width - 70, footerY - 10);
  context.fillStyle = accent;
  context.font = "600 13px Arial";
  context.fillText("TECNOLOGIA ORQUESTRA.CS", width - 70, footerY + 15);
  context.globalAlpha = 1;
  context.textAlign = "left";
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Imagem indisponível")), "image/png", .94));
}

export function WorkoutShareCard({ workoutName, studentName, profilePhoto = "", summary, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [photoUrl, setPhotoUrl] = useState(profilePhoto);
  const [showName, setShowName] = useState(true);
  const [showPerformance, setShowPerformance] = useState(true);
  const [status, setStatus] = useState("");
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    void renderCard(canvas, { photoUrl, workoutName, studentName, summary, showName, showPerformance });
  }, [photoUrl, showName, showPerformance, studentName, summary, workoutName]);

  useEffect(() => () => { if (photoUrl.startsWith("blob:")) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { setStatus("Escolha uma foto com até 12 MB."); return; }
    setPhotoUrl((current) => {
      if (current.startsWith("blob:")) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setStatus("");
  }

  async function share() {
    const canvas = canvasRef.current;
    if (!canvas || sharing) return;
    setSharing(true);
    setStatus("");
    try {
      const blob = await canvasBlob(canvas);
      const file = new File([blob], "treino-dama-de-ferro-story.png", { type: "image/png" });
      const data = { files: [file], title: "Treino concluído", text: "Treino concluído na Dama de Ferro Academia." };
      if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
        await navigator.share(data);
        setStatus("Arte pronta para compartilhar.");
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        URL.revokeObjectURL(url);
        setStatus("Imagem salva. Abra o Instagram e escolha essa arte.");
      }
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError") setStatus("Não foi possível gerar a arte. Tente outra foto.");
    } finally {
      setSharing(false);
    }
  }

  return <div className="workout-share-backdrop" role="dialog" aria-modal="true" aria-labelledby="workout-share-title">
    <section className="workout-share-panel">
      <header><div><small>COMPARTILHAR CONQUISTA</small><h2 id="workout-share-title">Sua arte está pronta</h2><p>Tire uma foto ou escolha uma imagem antes de publicar.</p></div><button type="button" aria-label="Voltar ao resultado" onClick={onClose}><X /></button></header>
      <div className="workout-share-layout">
        <div className="workout-share-preview is-story"><canvas ref={canvasRef} aria-label="Prévia da arte do treino" /></div>
        <div className="workout-share-options">
          <div className="workout-share-output"><strong>Story e Status</strong><span>1080 × 1920 · pronto para publicar</span></div>
          <fieldset><legend>Foto do treino</legend><div className="workout-share-photo-actions"><label className="workout-share-photo is-camera"><Camera /><span><strong>Tirar foto agora</strong><small>Use a câmera do celular</small></span><input type="file" accept="image/*" capture="environment" onChange={choosePhoto} /></label><label className="workout-share-photo"><ImagePlus /><span><strong>Escolher da galeria</strong><small>{photoUrl ? "Foto selecionada" : "JPG, PNG ou WebP"}</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} /></label></div></fieldset>
          <fieldset><legend>Privacidade</legend><label className="workout-share-toggle"><input type="checkbox" checked={showName} onChange={(event) => setShowName(event.target.checked)} /><span><Check />Mostrar meu nome</span></label><label className="workout-share-toggle"><input type="checkbox" checked={showPerformance} onChange={(event) => setShowPerformance(event.target.checked)} /><span><Check />Mostrar métricas disponíveis</span></label></fieldset>
          <p className="workout-share-privacy">A foto é processada somente no seu aparelho.</p>
          {status && <p className="workout-share-status" role="status">{status}</p>}
          <button className="workout-share-submit" type="button" onClick={() => void share()} disabled={sharing}>{sharing ? <Download /> : <Share2 />}{sharing ? "Gerando arte…" : "Compartilhar ou salvar"}</button>
        </div>
      </div>
    </section>
  </div>;
}
