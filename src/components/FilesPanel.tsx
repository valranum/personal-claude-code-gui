import { FileTree } from "./FileTree";

interface FilesPanelProps {
  cwd: string;
  onChangeCwd?: (newCwd: string) => void;
  onFileClick?: (filePath: string) => void;
  refreshKey?: number;
}

export function FilesPanel({ cwd, onChangeCwd, onFileClick, refreshKey }: FilesPanelProps) {
  return (
    <div className="files-panel">
      <FileTree
        cwd={cwd}
        onClose={() => {}}
        onFileClick={onFileClick}
        onChangeCwd={onChangeCwd}
        refreshKey={refreshKey}
      />
    </div>
  );
}
