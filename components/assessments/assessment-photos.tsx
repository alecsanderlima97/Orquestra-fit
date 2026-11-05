"use client";

import { useEffect, useRef, useState } from "react";
import { FirebaseStorage, deleteObject, getBlob, ref, uploadBytes } from "firebase/storage";
import { Camera, ImagePlus, X } from "lucide-react";

export const assessmentPhotoAngles = [
  { key: "frente", label: "Frente" },
  { key: "perfil", label: "Perfil" },
  { key: "costas", label: "Costas" },
] as const;

export type AssessmentPhotoAngle = (typeof assessmentPhotoAngles)[number]["key"];
export type AssessmentPhotoPaths = Partial<Record<AssessmentPhotoAngle, string>>;
export type AssessmentPhotoFiles = Partial<Record<AssessmentPhotoAngle, File>>;

const acceptedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxUploadBytes = 12 * 1024 * 1024;

export function AssessmentPhotoInputs({
  files,
  onChange,
  consentConfirmed,
  onConsentChange,
  disabled = false,
}: {
  files: AssessmentPhotoFiles;
  onChange: (files: AssessmentPhotoFiles) => void;
  consentConfirmed: boolean;
  onConsentChange: (confirmed: boolean) => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState("");

  const hasPhotos = assessmentPhotoAngles.some(({ key }) => Boolean(files[key]));

  function choosePhoto(angle: AssessmentPhotoAngle, file?: File) {
    setError("");
    if (!file) return;
    if (!acceptedPhotoTypes.has(file.type)) {
      setError("Escolha uma imagem JPG, PNG ou WebP.");
      return;
    }
    if (file.size > maxUploadBytes) {
      setError("Cada foto pode ter no máximo 12 MB antes da compressão.");
      return;
    }
    onChange({ ...files, [angle]: file });
  }

  function removePhoto(angle: AssessmentPhotoAngle) {
    const nextFiles = { ...files };
    delete nextFiles[angle];
    onChange(nextFiles);
    if (!assessmentPhotoAngles.some(({ key }) => key !== angle && Boolean(nextFiles[key]))) onConsentChange(false);
  }

  return <section className="assessment-photo-inputs" aria-label="Fotos de acompanhamento">
    <header><div><span>ACOMPANHAMENTO VISUAL</span><strong>Fotos desta avaliação</strong></div><small>Opcional · frente, perfil e costas</small></header>
    <p>As imagens ficam privadas: o aluno pode ver as próprias fotos, e a equipe pode acompanhar a evolução. Peça autorização antes de fotografar.</p>
    <div className="assessment-photo-input-grid">{assessmentPhotoAngles.map(({ key, label }) => <div className="assessment-photo-input" key={key}>
      <label className="assessment-photo-picker">
        {files[key] ? <PhotoPreview file={files[key]!} label={label} /> : <span className="assessment-photo-input-placeholder"><Camera size={20} /><small>{label}</small></span>}
        <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={disabled} onChange={(event) => { choosePhoto(key, event.target.files?.[0]); event.currentTarget.value = ""; }} aria-label={`Adicionar foto de ${label.toLowerCase()}`} />
        <span className="assessment-photo-input-action"><ImagePlus size={14} />{files[key] ? `Trocar ${label.toLowerCase()}` : `Adicionar ${label.toLowerCase()}`}</span>
      </label>
      {files[key] && <button type="button" className="assessment-photo-remove" onClick={() => removePhoto(key)} disabled={disabled} aria-label={`Remover foto de ${label.toLowerCase()}`}><X size={14} /></button>}
    </div>)}</div>
    {hasPhotos && <label className="assessment-photo-consent"><input type="checkbox" checked={consentConfirmed} onChange={(event) => onConsentChange(event.target.checked)} disabled={disabled} required /><span>Confirmo que o aluno autorizou o registro destas fotos para acompanhar a evolução física.</span></label>}
    {error && <small className="assessment-photo-error" role="alert">{error}</small>}
  </section>;
}

function PhotoPreview({ file, label }: { file: File; label: string }) {
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (imageRef.current) imageRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <img ref={imageRef} alt={`Prévia da foto de ${label.toLowerCase()}`} />;
}

function PrivatePhoto({ firebaseStorage, path, alt }: { firebaseStorage: FirebaseStorage; path: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    void getBlob(ref(firebaseStorage, path), 5 * 1024 * 1024).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [firebaseStorage, path]);
  return url ? <img src={url} alt={alt} loading="lazy" /> : <span role="status">{failed ? "Foto indisponível" : "Carregando foto…"}</span>;
}

async function compressAssessmentPhoto(file: File): Promise<Blob> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = sourceUrl;
    await image.decode();
    const maxDimension = 1440;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("photo_compression_unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) throw new Error("photo_compression_failed");
    return blob;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export async function uploadAssessmentPhotoFiles(
  firebaseStorage: FirebaseStorage,
  academyId: string,
  studentId: string,
  assessmentId: string,
  files: AssessmentPhotoFiles,
): Promise<AssessmentPhotoPaths> {
  const uploadedPaths: string[] = [];
  const paths: AssessmentPhotoPaths = {};
  try {
    for (const { key } of assessmentPhotoAngles) {
      const file = files[key];
      if (!file) continue;
      const compressed = await compressAssessmentPhoto(file);
      const path = `academies/${academyId}/assessment-photos/${studentId}/${assessmentId}/${key}.jpg`;
      await uploadBytes(ref(firebaseStorage, path), compressed, { contentType: "image/jpeg" });
      uploadedPaths.push(path);
      paths[key] = path;
    }
    return paths;
  } catch (error) {
    await Promise.allSettled(uploadedPaths.map((path) => deleteObject(ref(firebaseStorage, path))));
    throw error;
  }
}

export async function deleteAssessmentPhotoFiles(firebaseStorage: FirebaseStorage, paths: AssessmentPhotoPaths) {
  await Promise.all(Object.values(paths).filter((path): path is string => Boolean(path)).map((path) => deleteObject(ref(firebaseStorage, path))));
}

export function AssessmentPhotoComparison({
  firebaseStorage,
  current,
  previous,
  audience = "staff",
}: {
  firebaseStorage: FirebaseStorage | null;
  current: { date: string; photos?: AssessmentPhotoPaths };
  previous?: { date: string; photos?: AssessmentPhotoPaths } | null;
  audience?: "staff" | "student";
}) {
  const currentPhotos = current.photos ?? {};
  const previousPhotos = previous?.photos ?? {};
  const hasPhotos = assessmentPhotoAngles.some(({ key }) => currentPhotos[key] || previousPhotos[key]);
  if (!hasPhotos) return null;

  return <section className="assessment-photo-comparison" aria-label="Comparação de fotos de acompanhamento">
    <header><div><span>EVOLUÇÃO VISUAL</span><strong>Fotos por avaliação</strong></div><small>{audience === "student" ? "Visível para você e sua equipe" : "Acesso da equipe e do próprio aluno"}</small></header>
    <div className="assessment-photo-comparison-grid">{assessmentPhotoAngles.filter(({ key }) => currentPhotos[key] || previousPhotos[key]).map(({ key, label }) => <article key={key}>
      <strong>{label}</strong>
      <div className="assessment-photo-pair">
        {([ ["anterior", previous, previousPhotos[key]], ["atual", current, currentPhotos[key]] ] as const).map(([slot, assessment, path]) => {
          const imageKey = `${slot}:${key}`;
          if (!path || !assessment) return null;
          return <figure key={imageKey}><figcaption>{slot === "atual" ? "Atual" : "Anterior"} · {assessment.date}</figcaption>{firebaseStorage ? <PrivatePhoto key={path} firebaseStorage={firebaseStorage} path={path} alt={`${label}, avaliação ${slot}`} /> : <span>Foto indisponível</span>}</figure>;
        })}
      </div>
    </article>)}</div>
  </section>;
}
