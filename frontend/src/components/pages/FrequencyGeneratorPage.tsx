import { useStore } from "@/lib/store";
import { useFrequencyAcelineActions } from "@/lib/acelineActions";

export function FrequencyGeneratorPage() {
  const { showAlert } = useStore();
  useFrequencyAcelineActions();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Frequency Generator</h1>
          <p className="text-sm text-muted mt-0.5">
            Incentives Inc. — Tone generator, timer, alarm, journal & music studio
          </p>
        </div>
      </div>
      <div className="card p-0 overflow-hidden">
        <iframe
          src="/frequency-generator/index.html"
          className="w-full"
          style={{ height: "calc(100vh - 180px)", minHeight: "600px", border: "none" }}
          title="Frequency Generator"
          allow="autoplay; microphone"
          onError={() => showAlert("danger", "Failed to load Frequency Generator")}
        />
      </div>
    </div>
  );
}
