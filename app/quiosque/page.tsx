import type { Metadata } from "next";
import { KioskWorkouts } from "@/components/kiosk/kiosk-workouts";

export const metadata: Metadata = { title: "Quiosque de treinos | Orquestra Fit", robots: { index: false, follow: false } };

export default function KioskPage() { return <KioskWorkouts />; }
