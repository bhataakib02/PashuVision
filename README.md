# PashuVision - AI Livestock Management System

**AI-Powered Breed Recognition and Livestock Management Platform**

**Live Application**: [https://pashu-vision.vercel.app/](https://pashu-vision.vercel.app/)

PashuVision is a comprehensive livestock management system that uses advanced AI/ML models to identify cattle and buffalo breeds from images. Built with React and Node.js, it provides an intuitive interface for managing animal records, breed databases, and user administration.

## Features

### AI-Powered Breed Recognition
- **Real-time Breed Detection**: Advanced AI models (PyTorch & ONNX) for accurate breed identification
- **Species Detection**: Automatic cattle vs buffalo classification
- **Crossbreed Detection**: Identifies mixed-breed animals
- **Confidence Scoring**: Provides prediction confidence levels
- **Multi-Image Support**: Process multiple images per animal record

### User Management
- **Role-Based Access Control**: Admin and User roles
- **User Profile Management**: Update profile information, region, and photo
- **Secure Authentication**: JWT-based authentication system
- **Activity Logging**: Complete audit trail of user actions

### Animal Records Management
- **Comprehensive Records**: Track owner information, location, breed, age, and status
- **Record Editing**: Users can edit their own records (owner name and location)
- **Admin Controls**: Admins have full CRUD permissions
- **QR Code Generation**: Generate QR codes for animal identification
- **CSV Export**: Export records for external analysis
- **Search & Filter**: Advanced filtering by breed, location, and search terms

### Breed Database
- **Breed Management**: Admin can add, edit, delete, and view breeds
- **AI Auto-Fill**: Automatically populate breed details from AI predictions
- **Breed Images**: Dedicated page for managing breed images
- **Rare Breed Marking**: Mark and track rare breeds
- **Comprehensive Details**: Store origin, description, characteristics, and admin notes

### Image Management
- **Breed Images Gallery**: View and manage all breed images
- **Image Details**: View full image metadata including owner and user information
- **Download Support**: Download images directly from the interface
- **Filter by Species**: Filter images by cattle or buffalo

## Quick Start

### Prerequisites
- **Node.js** 18+ 
- **npm** or **yarn**
- **Supabase Account** (for database)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/bhataakib02/-PashuVision.git
cd bpa-breed-recognition
```

2. **Backend Setup**
```bash
cd backend
npm install
```

3. **Configure Environment Variables**
Create a `.env` file in the `backend` directory:
```env
JWT_SECRET=your-secret-key-here
SUPABASE_URL=your-supabase-project-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
USE_SUPABASE=true
PORT=4000
PYTORCH_SERVICE_URL=http://localhost:5001
```

4. **Set Up Supabase Database**
   - Create a new Supabase project
   - Run the SQL script from `backend/supabase-reset-database.sql` in your Supabase SQL Editor
   - Run `backend/add-region-column.sql` to add the region column
   - Run `backend/add-is-rare-breed-column.sql` to add the rare breed column
   - Run `backend/update-breeds-table-columns.sql` to add breed table columns
   - Configure RLS policies using `backend/fix-supabase-rls-policies.sql`

5. **Start Backend Server**
```bash
cd backend
npm run dev
```

6. **Frontend Setup** (in a new terminal)
```bash
cd frontend
npm install
npm run dev
```

### Access the Application
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:4000

### Create Admin User
Run the admin user creation script:
```bash
cd backend
node create-admin-user.js
```

## Architecture

### Backend (Node.js + Express)
- **RESTful API**: Comprehensive API endpoints for all operations
- **AI Models**: PyTorch and ONNX-based breed prediction models
- **Database Service**: Supabase integration for data persistence
- **Authentication**: JWT-based secure authentication
- **File Upload**: Multer for handling image uploads
- **WebSocket**: Real-time updates via Socket.IO

### Frontend (React + Vite)
- **Modern UI**: Responsive design with professional styling
- **Component-Based**: Reusable components for consistent UI
- **State Management**: React hooks for state management
- **Routing**: React Router for navigation
- **Error Handling**: Comprehensive error handling and user feedback

### AI Service (Python + PyTorch)
- **Model**: ConvNeXt Base (Quantized) - 94.6 MB
- **Deployment**: Railway (separate microservice)
- **API**: RESTful endpoints for breed prediction
- **Features**: Lazy loading, automatic retry, memory optimization

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/me` - Get current user profile
- `PUT /api/me` - Update user profile

### Animal Records
- `GET /api/animals` - List all animals (filtered by role)
- `POST /api/animals` - Create new animal record
- `PUT /api/animals/:id` - Update animal record
- `DELETE /api/animals/:id` - Delete animal record
- `POST /api/animals/:id/approve` - Approve record (admin only)
- `POST /api/animals/:id/reject` - Reject record (admin only)

### Breed Prediction
- `POST /api/predict` - AI breed prediction from image
- `POST /api/species` - Detect species (cattle/buffalo/non-animal)

### Admin - Users
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create new user
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user
- `PUT /api/admin/users/:id/status` - Update user status

### Admin - Breeds
- `GET /api/admin/breeds` - List all breeds
- `POST /api/admin/breeds` - Create new breed
- `PUT /api/admin/breeds/:id` - Update breed
- `DELETE /api/admin/breeds/:id` - Delete breed

## User Roles

### User
- Create and view animal records
- Edit own records (owner name and location only)
- View breed information
- Generate QR codes for records
- Update own profile

### Admin
- All user permissions
- Full CRUD access to all animal records
- User management (create, edit, delete users)
- Breed database management
- Approve/reject animal records
- View all records regardless of creator
- Access breed images management page

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **Role-Based Access Control**: Permissions based on user roles
- **Row Level Security**: Supabase RLS policies for data protection
- **Input Validation**: Comprehensive data validation
- **Password Hashing**: bcrypt for secure password storage
- **Activity Logging**: Complete audit trail

## Database Schema

The application uses Supabase (PostgreSQL) with the following main tables:

- **users**: User accounts and profiles
- **animals**: Animal records with breed, owner, and location information
- **breeds**: Breed database with characteristics and images
- **activity_logs**: System activity and audit logs

## Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express** - Web framework
- **Supabase** - Database and backend services
- **JWT** - Authentication
- **Multer** - File upload handling
- **Socket.IO** - Real-time communication
- **PyTorch/ONNX** - AI model inference

### Frontend
- **React** - UI framework
- **Vite** - Build tool
- **React Router** - Routing
- **Chart.js** - Data visualization
- **QR Code** - QR code generation

### AI Service
- **Python** - Runtime environment
- **PyTorch** - Deep learning framework
- **Flask** - Web framework
- **Gunicorn** - WSGI HTTP server
- **ConvNeXt** - Model architecture

## Development

### Project Structure
```
bpa-breed-recognition/
├── backend/
│   ├── src/
│   │   ├── ai/          # AI model predictors
│   │   ├── services/    # Business logic services
│   │   └── server.js    # Main server file
│   ├── models/          # AI model files
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/  # Reusable components
│   │   ├── pages/       # Page components
│   │   ├── services/    # Frontend services
│   │   └── utils/       # Utility functions
│   └── package.json
└── README.md
```

### Running in Development
```bash
# Backend
cd backend
npm run dev

# Frontend (new terminal)
cd frontend
npm run dev

# Python AI Service (optional, for local development)
cd backend/models
python pytorch_service.py
```

## Deployment

### Environment Variables

**Backend (Vercel)**
- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `USE_SUPABASE=true`
- `PYTORCH_SERVICE_URL` - Railway Python service URL
- `PORT`

**Python Service (Railway)**
- `MODEL_DOWNLOAD_URL_QUANTIZED` - Quantized model URL (recommended)
- `MODEL_DOWNLOAD_URL` - Original model URL (fallback)
- `PORT` - Railway sets this automatically

### Build for Production
```bash
# Frontend
cd frontend
npm run build

# Backend
cd backend
npm start
```

### Deployment Platforms
- **Frontend & Backend**: Vercel
- **AI Service**: Railway
- **Database**: Supabase

## AI Model Details

- **Architecture**: ConvNeXt Base (Quantized)
- **Model Size**: 94.6 MB (quantized from 1GB)
- **Accuracy**: ~69.5-70% (minimal loss from quantization)
- **Classes**: 41 cattle and buffalo breeds
- **Quantization**: INT8 dynamic quantization
- **Source**: GitHub Releases v2.0

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or contributions, please open an issue on GitHub.

## Acknowledgments

### Core Contributors
- **Mohammad Aakib Bhat** ([@bhataakib02](https://github.com/bhataakib02)) - Full Stack Web Development
- **Haroon Iqbal** ([@Haroon-89](https://github.com/Haroon-89)) - AI/ML Development & Data Science
- **Akeem Ali** ([@Akeem786](https://github.com/Akeem786)) - DataSet Collector
- 

### Open Source Libraries & Tools
- ONNX Runtime team for AI inference
- React and Node.js communities
- Supabase for backend infrastructure
- PyTorch and timm for model architecture
- All open-source contributors

For a complete list of contributors, see [CONTRIBUTORS.md](CONTRIBUTORS.md).

---

**Built with care for modern livestock management**

**PashuVision** - Transforming livestock management through AI technology
