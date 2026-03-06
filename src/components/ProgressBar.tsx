interface ProgressBarProps {
  currentStep: number;
  steps: { label: string }[];
}

export function ProgressBar({ currentStep, steps }: ProgressBarProps) {
  return (
    <div className="progress">
      {steps.map((step, idx) => (
        <div key={idx} className={`progress-step ${currentStep >= idx + 1 ? "active" : ""}`}>
          <span className="step-number">{idx + 1}</span>
          <span className="step-label">{step.label}</span>
        </div>
      ))}
    </div>
  );
}
