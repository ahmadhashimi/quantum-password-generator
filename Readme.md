# Quantum Password Generator

A futuristic, quantum-powered password generator built using Flask, Qiskit, and a sleek HTML/CSS/JS frontend. This project harnesses quantum randomness to generate secure, high-entropy passwords, making it a unique tool for cybersecurity and an impressive portfolio piece.

## Features

- **Quantum Randomness:** Uses Qiskit's `Aer` simulator to generate true quantum randomness by putting qubits in superposition.
- **Secure Password Generation:** Generates passwords that mix uppercase, lowercase, digits, and symbols.
- **Customizable Length:** Users can specify a password length (between 4 and 64 characters).
- **Futuristic UI:** Sleek, cyberpunk-inspired design with neon accents and personal branding.
- **Copy to Clipboard:** Easily copy the generated password with a single click.
- **Responsive Design:** Optimized for both desktop and mobile devices.

## Technologies Used

- **Backend:** Flask (Python)
- **Quantum Simulation:** Qiskit (`Aer` simulator, version 0.43 for stability)
- **Frontend:** HTML, CSS, JavaScript, with the futuristic [Orbitron](https://fonts.google.com/specimen/Orbitron) font from Google Fonts
- **CORS:** Flask-CORS

## Getting Started

### Prerequisites

- Python 3.x
- Virtualenv (optional but recommended)

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/quantum-password-generator.git
   cd quantum-password-generator