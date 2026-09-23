"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Check, Download, ImagePlus, Share2, X } from "lucide-react";

export type ShareWorkoutSummary = {
  durationSeconds: number;
  calories: number;
  maxLoad: number;
  maxReps: number;
  completedSets: number;
  totalSets: number;
};

type ShareFormat = "story" | "feed";
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

function drawOrquestraFooterLogo(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  context.save();
  context.shadowColor = "rgba(81, 171, 255, .34)";
  context.shadowBlur = 18;
  context.beginPath();
  context.roundRect(x, y, width, height, 12);
  context.clip();
  // O arquivo original é uma arte quadrada; este recorte mantém o lockup legível no rodapé.
  context.drawImage(image, 18, 370, 988, 270, x, y, width, height);
  context.restore();
  context.save();
  context.strokeStyle = "rgba(109, 189, 255, .55)";
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(x, y, width, height, 12);
  context.stroke();
  context.restore();
}

async function renderCard(canvas: HTMLCanvasElement, options: {
  format: ShareFormat;
  photoUrl: string;
  workoutName: string;
  studentName: string;
  summary: ShareWorkoutSummary;
  showName: boolean;
  showPerformance: boolean;
}) {
  const width = 1080;
  const height = options.format === "story" ? 1920 : 1080;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;

  const fallback = await loadImage("/dama-de-ferro.jpeg");
  const [damaLogo, orquestraLogo] = await Promise.all([
    loadImage("/dama-de-ferro.jpeg").catch(() => null),
    loadImage("/branding/orquestra-cs-logo.png").catch(() => null),
  ]);
  let background = fallback;
  if (options.photoUrl) {
    try { background = await loadImage(options.photoUrl); } catch { background = fallback; }
  }
  drawCover(context, background, width, height);
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(4, 5, 6, .30)");
  gradient.addColorStop(.42, "rgba(4, 5, 6, .48)");
  gradient.addColorStop(1, "rgba(3, 4, 5, .96)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const accent = "#e5b866";

  if (damaLogo) {
    context.save();
    context.beginPath();
    context.roundRect(70, 70, 78, 78, 18);
    context.clip();
    context.drawImage(damaLogo, 70, 70, 78, 78);
    context.restore();
  }
  context.fillStyle = accent;
  context.fillRect(165, 70, 8, 102);
  context.fillStyle = "#ffffff";
  context.font = "800 40px Arial";
  context.fillText("DAMA DE FERRO", 195, 112);
  context.fillStyle = accent;
  context.font = "700 22px Arial";
  context.letterSpacing = "5px";
  context.fillText("ACADEMIA", 198, 151);
  context.letterSpacing = "0px";

  const contentTop = options.format === "story" ? 920 : 360;
  context.fillStyle = accent;
  context.font = "800 25px Arial";
  context.fillText("TREINO CONCLUÍDO", 70, contentTop);
  context.fillStyle = "#ffffff";
  context.font = "800 70px Arial";
  const title = options.workoutName.length > 23 ? `${options.workoutName.slice(0, 22)}…` : options.workoutName;
  context.fillText(title, 70, contentTop + 88, 940);
  if (options.showName) {
    context.fillStyle = "rgba(255, 255, 255, .78)";
    context.font = "500 31px Arial";
    context.fillText(options.studentName, 70, contentTop + 142, 920);
  }

  const metricTop = contentTop + 205;
  metric(context, 70, metricTop, 450, "Tempo", durationLabel(options.summary.durationSeconds), "clock");
  metric(context, 560, metricTop, 450, "Séries", `${options.summary.completedSets}/${options.summary.totalSets}`, "sets");
  if (options.showPerformance) {
    metric(context, 70, metricTop + 195, 450, "Calorias", `≈ ${options.summary.calories} kcal`, "flame");
    metric(context, 560, metricTop + 195, 450, "Maior carga", options.summary.maxLoad > 0 ? `${options.summary.maxLoad} kg` : "Peso corporal", "weight");
  }

  const footerY = height - 100;
  context.fillStyle = "rgba(255, 255, 255, .66)";
  context.font = "500 22px Arial";
  context.fillText(new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date()), 70, footerY);
  context.textAlign = "right";
  if (orquestraLogo) {
    drawOrquestraFooterLogo(context, orquestraLogo, width - 300, footerY - 57, 230, 60);
  } else {
    context.fillStyle = "#6dbdff";
    context.font = "700 21px Arial";
    context.fillText("orquestra.cs", width - 70, footerY - 7);
    context.fillStyle = "rgba(255, 255, 255, .42)";
    context.font = "500 16px Arial";
    context.fillText("tecnologia", width - 70, footerY + 18);
  }
  context.textAlign = "left";
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Imagem indisponível")), "image/png", .94));
}

export function WorkoutShareCard({ workoutName, studentName, profilePhoto = "", summary, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [format, setFormat] = useState<ShareFormat>("story");
  const [photoUrl, setPhotoUrl] = useState(profilePhoto);
  const [showName, setShowName] = useState(true);
  const [showPerformance, setShowPerformance] = useState(true);
  const [status, setStatus] = useState("");
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    void renderCard(canvas, { format, photoUrl, workoutName, studentName, summary, showName, showPerformance });
  }, [format, photoUrl, showName, showPerformance, studentName, summary, workoutName]);

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
      const file = new File([blob], `treino-dama-de-ferro-${format}.png`, { type: "image/png" });
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
      <header><div><small>COMPARTILHAR CONQUISTA</small><h2 id="workout-share-title">Sua arte está pronta</h2><p>Escolha o formato e o que deseja mostrar.</p></div><button type="button" aria-label="Voltar ao resultado" onClick={onClose}><X /></button></header>
      <div className="workout-share-layout">
        <div className={`workout-share-preview is-${format}`}><canvas ref={canvasRef} aria-label="Prévia da arte do treino" /></div>
        <div className="workout-share-options">
          <fieldset><legend>Formato</legend><div className="workout-share-format"><button type="button" className={format === "story" ? "active" : ""} onClick={() => setFormat("story")}>Story <span>9:16</span></button><button type="button" className={format === "feed" ? "active" : ""} onClick={() => setFormat("feed")}>Feed <span>1:1</span></button></div></fieldset>
          <label className="workout-share-photo"><ImagePlus /><span><strong>Foto de fundo</strong><small>{photoUrl ? "Foto selecionada" : "Use sua foto ou mantenha a arte da academia"}</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} /></label>
          <fieldset><legend>Privacidade</legend><label className="workout-share-toggle"><input type="checkbox" checked={showName} onChange={(event) => setShowName(event.target.checked)} /><span><Check />Mostrar meu nome</span></label><label className="workout-share-toggle"><input type="checkbox" checked={showPerformance} onChange={(event) => setShowPerformance(event.target.checked)} /><span><Check />Mostrar calorias e carga</span></label></fieldset>
          <p className="workout-share-privacy">A foto é processada somente no seu aparelho.</p>
          {status && <p className="workout-share-status" role="status">{status}</p>}
          <button className="workout-share-submit" type="button" onClick={() => void share()} disabled={sharing}>{sharing ? <Download /> : <Share2 />}{sharing ? "Gerando arte…" : "Compartilhar ou salvar"}</button>
        </div>
      </div>
    </section>
  </div>;
}
