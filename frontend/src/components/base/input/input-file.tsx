import { type ReactNode } from "react";
import { HintText } from "@/components/base/input/hint-text";
import { cx } from "@/utils/cx";

export interface InputFileProps {
    hint?: ReactNode;
    isRequired?: boolean;
    isLoading?: boolean;
    onChange?: (files: FileList | null) => void;
    className?: string;
}

export const InputFile = ({ hint, isLoading, onChange, className }: InputFileProps) => {
    return (
        <div className={cx("group flex w-full flex-col items-center gap-1.5", className)}>
            <span
                className="material-symbols-outlined text-ink-40"
                style={{ fontSize: 48, fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}
                aria-hidden="true"
            >
                arrow_upload_ready
            </span>

            <div className="mt-2 flex justify-center text-sm leading-6 text-ink-60">
                <label className="relative cursor-pointer rounded-md font-semibold text-ink hover:text-ink-80 focus-within:outline-none focus-within:ring-2 focus-within:ring-coral focus-within:ring-offset-2">
                    <span>{isLoading ? "uploading…" : "upload a file"}</span>
                    <input
                        type="file"
                        className="sr-only"
                        onChange={(e) => onChange?.(e.target.files)}
                        disabled={isLoading}
                        accept=".pdf,.doc,.docx"
                    />
                </label>
                <p className="pl-1">or drag and drop</p>
            </div>

            {hint && <HintText>{hint}</HintText>}
        </div>
    );
};
