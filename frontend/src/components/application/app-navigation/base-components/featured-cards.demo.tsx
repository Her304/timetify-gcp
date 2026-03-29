import { X as CloseX } from "@untitledui/icons";

interface FeaturedCardProgressBarProps {
  title: string;
  description: string;
  confirmLabel: string;
  progress: number;
  className?: string;
  onDismiss?: () => void;
  onConfirm?: () => void;
}

export const FeaturedCardProgressBar = ({
  title,
  description,
  confirmLabel,
  progress,
  className = "",
  onDismiss,
  onConfirm,
}: FeaturedCardProgressBarProps) => {
  return (
    <div className={`p-4 bg-gray-50 rounded-lg border border-gray-200 ${className}`}>
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <button
          type="button"
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-500"
        >
          <CloseX className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-3">{description}</p>
      <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
        <div
          className="bg-indigo-600 h-2 rounded-full"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
      <button
        type="button"
        onClick={onConfirm}
        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
      >
        {confirmLabel}
      </button>
    </div>
  );
};
