"""Gunicorn configuration for production deployment"""
import multiprocessing
import os

# Server socket
bind = f"0.0.0.0:{os.environ.get('PORT', '5001')}"
backlog = 2048

# Worker processes
workers = 1  # Single worker for CPU-only PyTorch model (reduces memory usage)
worker_class = "sync"
worker_connections = 100  # Reduced from 1000 to save memory
timeout = 300  # Increased timeout for model loading
keepalive = 5

# Threading - reduced to save memory
threads = 1  # Reduced from 2 to minimize memory footprint

# Logging
accesslog = "-"  # Log to stdout
errorlog = "-"   # Log to stderr
loglevel = "error"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'

# Process naming
proc_name = "pytorch_service"

# Server mechanics
daemon = False
pidfile = None
umask = 0
user = None
group = None
tmp_upload_dir = None

# Preload app for better performance
# Set to False to avoid issues with background model loading thread
preload_app = False

# Graceful timeout - increased for model cleanup
graceful_timeout = 60

# Restart workers after this many requests (prevents memory leaks)
# Reduced to restart more frequently and prevent memory buildup
max_requests = 500  # Reduced from 1000 to restart workers more often
max_requests_jitter = 25  # Reduced from 50

# Worker timeout
# Removed worker_tmp_dir - let Gunicorn use default temp directory
# worker_tmp_dir = "/dev/shm"  # This path may not exist on Railway

def on_starting(server):
    """Called just before the master process is initialized."""
    try:
        server.log.info("Starting PyTorch Prediction Service with Gunicorn")
        # Validate environment
        port = os.environ.get('PORT', '5001')
        server.log.info(f"Binding to port: {port}")
    except Exception as e:
        server.log.error(f"Error in on_starting: {e}")
        # Don't raise - allow service to start

def when_ready(server):
    """Called just after the server is started."""
    try:
        server.log.info("Server is ready. Spawning workers")
        server.log.info("Health check endpoint available at: /health")
    except Exception as e:
        server.log.error(f"Error in when_ready: {e}")
        # Don't raise - service is already started

def on_exit(server):
    """Called just before exiting Gunicorn."""
    try:
        server.log.info("Shutting down: Master")
    except Exception:
        pass  # Ignore errors during shutdown

def worker_int(worker):
    """Called when a worker receives the INT or QUIT signal."""
    try:
        worker.log.info("Worker received INT or QUIT signal - graceful shutdown")
    except Exception:
        pass  # Ignore errors during signal handling

def pre_fork(server, worker):
    """Called just before a worker is forked."""
    try:
        # Validate worker can be created
        pass
    except Exception as e:
        server.log.error(f"Error in pre_fork: {e}")
        # Don't raise - allow fork to proceed

def post_fork(server, worker):
    """Called just after a worker has been forked."""
    try:
        worker.log.info("Worker spawned (pid: %s)", worker.pid)
    except Exception as e:
        # Log but don't crash
        try:
            server.log.error(f"Error logging worker spawn: {e}")
        except:
            pass

def pre_exec(server):
    """Called just before a new master process is forked."""
    try:
        server.log.info("Forking new master process")
    except Exception:
        pass  # Ignore errors

def worker_abort(worker):
    """Called when a worker times out."""
    try:
        worker.log.warning("Worker timeout (pid: %s) - this is normal during model loading", worker.pid)
        worker.log.info("Worker will be restarted automatically")
    except Exception:
        pass  # Ignore errors during abort

def worker_exit(server, worker):
    """Called just after a worker has been exited."""
    try:
        server.log.info("Worker exited (pid: %s)", worker.pid)
    except Exception:
        pass  # Ignore errors

def on_reload(server):
    """Called to recycle workers during a reload via SIGHUP."""
    try:
        server.log.info("Reloading workers...")
    except Exception:
        pass  # Ignore errors

