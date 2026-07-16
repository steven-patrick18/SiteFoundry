import { SshSession } from './ssh.service';

export interface ServerFacts {
  os?: string;
  os_version?: string;
  kernel?: string;
  cpu_cores?: number;
  ram_gb?: number;
  disk_gb?: number;
  nginx_v?: string | null;
  certbot_v?: string | null;
  node_v?: string | null;
  uptime?: string;
}

/** Probe detected facts over an open SSH session (§5 Add Server flow). */
export async function probeFacts(session: SshSession): Promise<ServerFacts> {
  const script = [
    `. /etc/os-release 2>/dev/null && echo "OS|$NAME|$VERSION_ID"`,
    `echo "KERNEL|$(uname -r)"`,
    `echo "CPU|$(nproc 2>/dev/null)"`,
    `echo "RAM|$(free -m 2>/dev/null | awk '/^Mem:/{print $2}')"`,
    `echo "DISK|$(df -BG --output=size / 2>/dev/null | tail -1 | tr -dc '0-9')"`,
    `echo "NGINX|$(nginx -v 2>&1 | grep -o '[0-9.]*' | head -1)"`,
    `echo "CERTBOT|$(certbot --version 2>&1 | grep -o '[0-9.]*' | head -1)"`,
    `echo "NODE|$(node -v 2>/dev/null)"`,
    `echo "UPTIME|$(uptime -p 2>/dev/null)"`,
  ].join(' ; ');

  const { stdout } = await session.exec(script, 30_000);
  const facts: ServerFacts = {};

  for (const line of stdout.split('\n')) {
    const [tag, ...rest] = line.trim().split('|');
    const value = rest.join('|').trim();
    if (!value) continue;
    switch (tag) {
      case 'OS':
        facts.os = rest[0]?.trim();
        facts.os_version = rest[1]?.trim();
        break;
      case 'KERNEL':
        facts.kernel = value;
        break;
      case 'CPU':
        facts.cpu_cores = parseInt(value, 10) || undefined;
        break;
      case 'RAM': {
        const mb = parseInt(value, 10);
        if (mb) facts.ram_gb = Math.round((mb / 1024) * 10) / 10;
        break;
      }
      case 'DISK':
        facts.disk_gb = parseInt(value, 10) || undefined;
        break;
      case 'NGINX':
        facts.nginx_v = value || null;
        break;
      case 'CERTBOT':
        facts.certbot_v = value || null;
        break;
      case 'NODE':
        facts.node_v = value || null;
        break;
      case 'UPTIME':
        facts.uptime = value;
        break;
    }
  }
  return facts;
}
