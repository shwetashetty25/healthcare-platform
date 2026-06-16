# Jenkins Pipeline Configuration Guide

This directory documents how to run the declarative CI/CD pipeline defined in the root [Jenkinsfile](file:///Users/shwetashetty/Documents/HealthCare-Platform/Jenkinsfile) inside a local environment.

## 1. Deploying Jenkins locally

To run Jenkins in a container with access to host Docker daemon (Docker-in-Docker style), run the following from the root directory:

```bash
docker compose up -d jenkins
```

This starts Jenkins on port `8080`.

## 2. Unlocking Jenkins

1. Retrieve the administrator setup token:
   ```bash
   docker exec -it jenkins cat /var/jenkins_home/secrets/initialAdminPassword
   ```
2. Navigate to `http://localhost:8080` in your web browser.
3. Paste the setup token, click **Install Suggested Plugins**, and set up an administrator account.

## 3. Configuring Dependencies

To allow Jenkins to interact with the local Kubernetes and Docker setups:
- **Docker Tooling**: The local pipeline binds to `/var/run/docker.sock`, which means container builds execute directly on your host Docker engine. No extra registry pushes are required for local testing.
- **Kubectl Tooling**: Copy your local `~/.kube/config` into the `/var/jenkins_home/.kube/config` within the container or install the Kubernetes Continuous Deploy plugin.

## 4. Setting Up the Pipeline Job

1. Go to the Jenkins dashboard and click **New Item**.
2. Enter the name `Healthcare-Exchange-Platform`, select **Pipeline**, and click **OK**.
3. Under the **Pipeline** configuration section:
   - Select **Definition**: *Pipeline script from SCM*
   - Select **SCM**: *Git*
   - Enter your local repository path (e.g. `/workspace` or git URL).
   - Verify the script path points to `Jenkinsfile`.
4. Save and click **Build Now** to execute the pipeline.
